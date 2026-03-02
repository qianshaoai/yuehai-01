import Anthropic from '@anthropic-ai/sdk'
import type { RiskLevel } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
  // 原始文件 Buffer（用于 Claude Vision：PDF / 图片）
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
 * 调用 Claude API 从多个文件内容中提取结构化字段
 */
export async function extractFromFiles(
  files: FileContent[],
  columns: string[]
): Promise<RowResult[]> {
  const contentBlocks: Anthropic.MessageParam['content'] = []

  const fileDescriptions: string[] = []

  for (const file of files) {
    fileDescriptions.push(file.fileName)

    contentBlocks.push({
      type: 'text',
      text: `\n--- 文件：${file.fileName} (${file.fileType}) ---`,
    })

    if (file.fileType === 'image' && file.buffer && file.mimeType) {
      // 图片：直接作为 vision 输入
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: file.buffer.toString('base64'),
        },
      })
    } else if (file.fileType === 'pdf' && file.buffer) {
      // PDF：使用 Claude 的原生文档理解（beta feature）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: file.buffer.toString('base64'),
        },
      } as any)
    } else if (file.text) {
      // 文本内容（docx 解析结果 / PDF 文字层）
      contentBlocks.push({
        type: 'text',
        text: file.text.slice(0, 8000), // 防止超长
      })
    }
  }

  if (contentBlocks.filter((b) => b.type !== 'text').length === 0 &&
      contentBlocks.every((b) => b.type === 'text' && (b as Anthropic.TextBlockParam).text.startsWith('\n---'))) {
    throw new Error('没有可解析的文件内容，请检查文件是否损坏')
  }

  const systemPrompt = buildExtractionPrompt(columns, fileDescriptions)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  })

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // 解析 JSON（支持 Claude 在代码块中返回 JSON 的情况）
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
