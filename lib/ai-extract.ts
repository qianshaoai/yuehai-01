import OpenAI from 'openai'
import type { RiskLevel } from '@/types'

// 智谱 AI OpenAI 兼容接口
const client = new OpenAI({
  apiKey: process.env.ZHIPU_API_KEY,
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
})

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
2. 同一字段若在多个文件中出现不同值，在 note 中写明冲突候选值，risk_level = "red"
3. 价格字段：只保留数字，去除货币单位（如 USD 1200 → 1200）
4. 日期字段：统一格式为 YYYY-MM-DD
5. 币别字段：统一大写（USD / CNY / EUR 等）
6. 置信度（confidence）：0-1，若字段识别不确定则 < 0.8，并设 risk_level = "yellow"
7. 找不到的非必填字段：value = ""，risk_level = "none"（或 yellow 视模糊程度）

【输出格式】
只输出 JSON，不要任何解释文字，格式如下：
{
  "rows": [
    {
      "row": 1,
      "cells": {
        "字段名": {
          "value": "提取值",
          "confidence": 0.95,
          "risk_level": "none",
          "note": ""
        }
      }
    }
  ]
}

如无任何可提取数据，返回 {"rows": []}`
}

/**
 * 调用智谱 AI 从多个文件内容中提取结构化字段
 */
export async function extractFromFiles(
  files: FileContent[],
  columns: string[]
): Promise<RowResult[]> {
  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

  const userContent: ContentPart[] = []
  const fileDescriptions: string[] = []
  let hasVision = false

  for (const file of files) {
    fileDescriptions.push(file.fileName)

    userContent.push({
      type: 'text',
      text: `\n--- 文件：${file.fileName} (${file.fileType}) ---`,
    })

    if (file.fileType === 'image' && file.buffer && file.mimeType) {
      // 图片：base64 传给视觉模型
      hasVision = true
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.mimeType};base64,${file.buffer.toString('base64')}`,
        },
      })
    } else if (file.text) {
      // PDF 文字层 / DOCX 提取的文本
      userContent.push({
        type: 'text',
        text: file.text.slice(0, 10000),
      })
    } else if (file.fileType === 'pdf') {
      // 扫描件 PDF，无法提取文字
      userContent.push({
        type: 'text',
        text: '[此 PDF 为扫描件，无法提取文字，请提供文字版 PDF 或图片格式]',
      })
    }
  }

  if (userContent.filter(b => b.type !== 'text' || !(b as { type: 'text'; text: string }).text.startsWith('\n---')).length === 0) {
    throw new Error('没有可解析的文件内容，请检查文件是否损坏')
  }

  const model = hasVision ? VISION_MODEL : TEXT_MODEL
  const systemPrompt = buildExtractionPrompt(columns, fileDescriptions)

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  })

  const rawText = response.choices[0]?.message?.content ?? ''

  // 解析 JSON（支持模型在代码块中返回 JSON 的情况）
  const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ??
                   rawText.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) {
    throw new Error(`AI 返回内容无法解析，原始输出：${rawText.slice(0, 200)}`)
  }

  let parsed: { rows: RowResult[] }
  try {
    parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as { rows: RowResult[] }
  } catch {
    throw new Error('AI 返回的 JSON 格式有误，请重试')
  }

  // 补全每行所有列（确保每列都有默认值）
  return parsed.rows.map((row, i) => {
    const cells: Record<string, CellResult> = {}
    for (const col of columns) {
      if (row.cells[col]) {
        cells[col] = row.cells[col]
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
