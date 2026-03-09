import OpenAI from 'openai'
import sharp from 'sharp'
import type { RiskLevel } from '@/types'

// 将图片压缩并转为 JPEG（智谱视觉 API 限制）
async function toJpegBuffer(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}

// 智谱 AI OpenAI 兼容接口（懒加载，避免构建时报缺少 API Key 错误）
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.ZHIPU_API_KEY ?? 'placeholder',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    })
  }
  return _client
}

// 默认模型：glm-4-flash（免费，纯文本）
// 若文件包含图片，自动切换为 glm-4v-flash（免费，支持视觉）
const TEXT_MODEL = process.env.ZHIPU_MODEL ?? 'glm-4-flash'
const VISION_MODEL = process.env.ZHIPU_VISION_MODEL ?? 'glm-4v-flash'

export interface CellResult {
  value: string
  confidence: number
  risk_level: RiskLevel
  note: string
}

export interface RowResult {
  row: number
  cells: Record<string, CellResult>
}

export interface FileContent {
  fileName: string
  fileType: 'pdf' | 'image' | 'docx'
  // 文本内容（pdf文字层/docx）
  text?: string
  // 原始文件 Buffer（用于视觉模型：图片）
  buffer?: Buffer
  mimeType?: string
}

const REQUIRED_FIELDS = ['起运港', '目的港', '开航日', '截关日']

function buildExtractionPrompt(columns: string[], fileDescriptions: string[]): string {
  const requiredNote = REQUIRED_FIELDS.filter(f => columns.includes(f))
  return `你是专业的国际货运运价/船期数据提取助手，服务于货代公司。

任务：从以下${fileDescriptions.length}个文件中提取运价和船期数据，填入指定模板字段。

【模板字段列表（共${columns.length}列）】
${columns.join('、')}

【必填字段】（缺失则 risk_level = "red"）
${requiredNote.join('、')}

【提取规则】
1. 每条不同的"船次/航班"（由起运港+目的港+船名航次+开航日唯一确定）为一行数据
2. 同一字段若在多个文件中出现不同值，在 n 中写明冲突候选值，r = "red"
3. 价格字段：只保留数字，去除货币单位（如 USD 1200 → 1200）
4. 日期字段：统一格式为 YYYY-MM-DD
5. 币别字段：统一大写（USD / CNY / EUR 等）
6. 识别不确定的字段设 r = "yellow"
7. 找不到的非必填字段直接省略（不输出该字段）

【输出格式】紧凑 JSON，不要缩进，不要解释文字：
{"rows":[{"row":1,"cells":{"字段名":{"v":"提取值","r":"none","n":""}}}]}

字段说明：v=值，r=风险等级(none/yellow/red)，n=备注(无则留空串)
- 有值且无风险的字段：{"v":"值","r":"none","n":""}
- 风险字段：{"v":"值","r":"yellow","n":"原因"}
- 必填字段缺失：{"v":"","r":"red","n":"必填字段缺失"}
- 找不到的非必填字段：省略不输出

如无任何可提取数据，返回 {"rows":[]}`
}

/**
 * 步骤一：用视觉模型将图片转录为文字（glm-4v-flash 限制 max_tokens=1024，仅用于转录）
 */
async function transcribeImage(jpegBuf: Buffer, fileName: string): Promise<string> {
  const url = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`
  let response
  try {
    response = await getClient().chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url } } as { type: 'image_url'; image_url: { url: string } },
          { type: 'text', text: '请将图片中所有文字、表格、数字完整转录为文本，保持原始格式，不要遗漏任何内容。' } as { type: 'text'; text: string },
        ],
      }],
    })
  } catch (apiErr: unknown) {
    const err = apiErr as { status?: number; message?: string; error?: unknown }
    throw new Error(`视觉转录失败 (${err?.status ?? '?'}): ${err?.message ?? String(apiErr)}`)
  }
  const text = response.choices[0]?.message?.content ?? ''
  return text
}

/**
 * 调用智谱 AI 从多个文件内容中提取结构化字段
 * 图片文件先用视觉模型转录为文字，再统一用文本模型提取
 */
export async function extractFromFiles(
  files: FileContent[],
  columns: string[]
): Promise<RowResult[]> {
  const textParts: string[] = []
  const fileDescriptions: string[] = []

  for (const file of files) {
    fileDescriptions.push(file.fileName)

    if (file.fileType === 'image' && file.buffer) {
      // 图片：先用视觉模型转录为文字
      const jpegBuf = await toJpegBuffer(file.buffer)
          const transcribed = await transcribeImage(jpegBuf, file.fileName)
      textParts.push(`--- 文件：${file.fileName} (图片转录) ---\n${transcribed}`)
    } else if (file.text) {
      textParts.push(`--- 文件：${file.fileName} (${file.fileType}) ---\n${file.text.slice(0, 10000)}`)
    } else if (file.fileType === 'pdf') {
      textParts.push(`--- 文件：${file.fileName} ---\n[扫描件 PDF，无法提取文字]`)
    }
  }

  if (textParts.length === 0) {
    throw new Error('没有可解析的文件内容，请检查文件是否损坏')
  }

  const systemPrompt = buildExtractionPrompt(columns, fileDescriptions)
  const userText = textParts.join('\n\n')

  let response
  try {
    response = await getClient().chat.completions.create({
      model: TEXT_MODEL,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    })
  } catch (apiErr: unknown) {
    const err = apiErr as { status?: number; message?: string; error?: unknown }
    console.error('[ai-extract] API 调用失败:', {
      status: err?.status,
      message: err?.message,
      error: JSON.stringify(err?.error ?? apiErr),
    })
    throw new Error(`AI API 错误 (${err?.status ?? '?'}): ${err?.message ?? String(apiErr)}`)
  }

  const rawText = response.choices[0]?.message?.content ?? ''

  // 解析 JSON（支持 markdown 代码块 / 纯 JSON 两种形式）
  const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ??
                   rawText.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) {
    throw new Error(`AI 返回内容无法解析，原始输出：${rawText.slice(0, 200)}`)
  }

  type RawCell = {
    // 短格式（新提示词）
    v?: string; r?: string; n?: string
    // 长格式（兼容旧响应）
    value?: string; risk_level?: string; note?: string; confidence?: number
  }
  let parsed: { rows: Array<{ row: number; cells: Record<string, RawCell> }> }
  try {
    parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0])
  } catch {
    throw new Error(`AI 返回的 JSON 格式有误，原始输出：${rawText.slice(0, 200)}`)
  }

  // 补全每行所有列，兼容长短格式
  return parsed.rows.map((row, i) => {
    const cells: Record<string, CellResult> = {}
    for (const col of columns) {
      const raw = row.cells?.[col]
      if (raw) {
        const value = raw.v ?? raw.value ?? ''
        const risk_level = (raw.r ?? raw.risk_level ?? 'none') as RiskLevel
        const note = raw.n ?? raw.note ?? ''
        const confidence = raw.confidence ?? (risk_level === 'yellow' ? 0.7 : 0.95)
        cells[col] = { value, confidence, risk_level, note }
      } else {
        const isRequired = REQUIRED_FIELDS.includes(col)
        cells[col] = {
          value: '',
          confidence: 0,
          risk_level: isRequired ? 'red' : 'none',
          note: isRequired ? '必填字段缺失' : '',
        }
      }
    }
    return { row: i + 1, cells }
  })
}
