export interface ParsedPdf {
  text: string
  numPages: number
  type: 'text'
}

/**
 * 解析 PDF 文件，提取文本内容。
 * 对于文字层丰富的 PDF 返回文本；
 * 对于扫描件/纯图片 PDF，文本会较少，后续由 AI 通过 PDF base64 二次理解。
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {
  // 懒加载：避免 Turbopack 编译时分析 pdf-parse 原生模块导致 worker 崩溃
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
  const data = await pdfParse(buffer)
  return {
    text: data.text,
    numPages: data.numpages,
    type: 'text',
  }
}
