import mammoth from 'mammoth'

export interface ParsedDocument {
  text: string
  type: 'text'
}

/**
 * 解析 Word (.docx) 文件，提取纯文本（含表格内容）
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value, type: 'text' }
}
