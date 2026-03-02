import ExcelJS from 'exceljs'
import type { RowResult } from './ai-extract'

/**
 * 基于模板 Excel 文件或列名列表生成结果 Excel。
 * - 第一行：表头（列名）
 * - 后续行：提取数据
 * - 风险字段：红色/黄色背景标注
 */
export async function generateExcel(params: {
  columns: string[]
  rows: RowResult[]
  routeName: string
  taskId: string
  templateBuffer?: Buffer  // 如果有模板文件，保留其样式
}): Promise<Buffer> {
  const { columns, rows, routeName, taskId, templateBuffer } = params

  const workbook = new ExcelJS.Workbook()
  let sheet: ExcelJS.Worksheet

  if (templateBuffer) {
    // 加载原始模板，在其基础上填写数据
    await workbook.xlsx.load(templateBuffer.buffer as ArrayBuffer)
    sheet = workbook.worksheets[0]
    // 清除第2行以后的数据行（保留表头样式）
    const lastRow = sheet.rowCount
    for (let r = 2; r <= lastRow; r++) {
      sheet.getRow(r).values = []
    }
  } else {
    // 无模板：新建 Sheet
    sheet = workbook.addWorksheet('运价数据')
    // 写入表头
    const headerRow = sheet.addRow(columns)
    headerRow.font = { bold: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F0FE' },
    }
    headerRow.border = {
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    }
  }

  // 构建列名 → 列序号的映射（基于表头行）
  const headerRow = sheet.getRow(1)
  const colIndexMap: Record<string, number> = {}
  headerRow.eachCell((cell, colNum) => {
    const key = String(cell.value ?? '')
    if (key) colIndexMap[key] = colNum
  })

  // 未在模板中找到的列，追加到末尾
  let nextColNum = Object.keys(colIndexMap).length + 1
  for (const col of columns) {
    if (!colIndexMap[col]) {
      colIndexMap[col] = nextColNum++
    }
  }

  // 填充数据行
  const dataStartRow = templateBuffer ? 2 : 2
  for (const rowResult of rows) {
    const targetRowNum = dataStartRow + rowResult.row - 1
    const sheetRow = sheet.getRow(targetRowNum)

    for (const [colKey, cellResult] of Object.entries(rowResult.cells)) {
      const colNum = colIndexMap[colKey]
      if (!colNum) continue

      const cell = sheetRow.getCell(colNum)
      cell.value = cellResult.value

      // 风险标注
      if (cellResult.risk_level === 'red') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }, // 浅红
        }
        cell.font = { color: { argb: 'FF991B1B' } }
        if (cellResult.note) {
          cell.note = cellResult.note
        }
      } else if (cellResult.risk_level === 'yellow') {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF9C3' }, // 浅黄
        }
        cell.font = { color: { argb: 'FF854D0E' } }
        if (cellResult.note) {
          cell.note = cellResult.note
        }
      }

      // 手动编辑标记（蓝色字体）
      if (cellResult.value && cellResult.risk_level === 'none') {
        // 正常值保持默认样式
      }
    }

    sheetRow.commit()
  }

  // 自动列宽
  sheet.columns.forEach((col) => {
    let maxLen = 10
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length
      if (len > maxLen) maxLen = len
    })
    col.width = Math.min(maxLen + 2, 30)
  })

  // 冻结首行
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
