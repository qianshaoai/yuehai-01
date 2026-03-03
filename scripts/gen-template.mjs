/**
 * 生成俄罗斯航线路由模板 Excel
 * 运行：node scripts/gen-template.mjs
 */
import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../public/templates/russia.xlsx')

const COLUMNS = [
  '起运港', '目的港', '船东', '船名航次',
  '截关日', '开航日', '航线代码', '航程(天)',
  '币别',
  '20GP底价', '40GP底价', '40HQ底价', '45HQ底价', '40RH底价', '40NOR底价',
  '20GP指导价', '40GP指导价', '40HQ指导价',
  '中转/直航', '中转港', '有效期', '备注', '舱位状态', '价格来源',
]

const WIDTHS = {
  '起运港': 10, '目的港': 16, '船东': 8, '船名航次': 22,
  '截关日': 13, '开航日': 13, '航线代码': 10, '航程(天)': 9,
  '币别': 7,
  '20GP底价': 10, '40GP底价': 10, '40HQ底价': 10,
  '45HQ底价': 10, '40RH底价': 10, '40NOR底价': 10,
  '20GP指导价': 11, '40GP指导价': 11, '40HQ指导价': 11,
  '中转/直航': 10, '中转港': 10, '有效期': 13, '备注': 18, '舱位状态': 9, '价格来源': 24,
}

const wb = new ExcelJS.Workbook()
wb.creator = '跃海国际货运'
wb.created = new Date()

const ws = wb.addWorksheet('Sheet1', {
  views: [{ state: 'frozen', ySplit: 1 }],
})

// ---------- 第一行：表头（API 固定读第1行作为列名） ----------
const headerRow = ws.getRow(1)
headerRow.height = 22

// 分组颜色
const GROUP_COLOR = {
  basic:   'FFDCE6F1', // 基本信息
  rate:    'FFFFE0B2', // 底价
  guide:   'FFFCE4EC', // 指导价
  other:   'FFE8F5E9', // 其他
}
const BASIC_COLS  = ['起运港','目的港','船东','船名航次','截关日','开航日','航线代码','航程(天)','币别']
const RATE_COLS   = ['20GP底价','40GP底价','40HQ底价','45HQ底价','40RH底价','40NOR底价']
const GUIDE_COLS  = ['20GP指导价','40GP指导价','40HQ指导价']
const OTHER_COLS  = ['中转/直航','中转港','有效期','备注','舱位状态','价格来源']

COLUMNS.forEach((col, i) => {
  const cell = headerRow.getCell(i + 1)
  cell.value = col

  let bg = GROUP_COLOR.other
  if (BASIC_COLS.includes(col))  bg = GROUP_COLOR.basic
  if (RATE_COLS.includes(col))   bg = GROUP_COLOR.rate
  if (GUIDE_COLS.includes(col))  bg = GROUP_COLOR.guide

  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  cell.font = { name: 'Microsoft YaHei', bold: true, size: 10, color: { argb: 'FF1A3A6B' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = {
    top:    { style: 'thin', color: { argb: 'FF9DB8D2' } },
    left:   { style: 'thin', color: { argb: 'FF9DB8D2' } },
    bottom: { style: 'medium', color: { argb: 'FF1A3A6B' } },
    right:  { style: 'thin', color: { argb: 'FF9DB8D2' } },
  }

  // 列宽
  ws.getColumn(i + 1).width = WIDTHS[col] ?? 12
})

// ---------- 第2～51行：数据区（50行空白，带交替底色 + 数据验证） ----------
for (let r = 2; r <= 51; r++) {
  const row = ws.getRow(r)
  row.height = 18
  const isEven = (r % 2 === 0)

  COLUMNS.forEach((col, i) => {
    const cell = row.getCell(i + 1)

    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF5F8FC' : 'FFFFFFFF' },
    }
    cell.font = { name: 'Microsoft YaHei', size: 10 }
    cell.border = {
      top:    { style: 'hair', color: { argb: 'FFCCCCCC' } },
      left:   { style: 'hair', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
      right:  { style: 'hair', color: { argb: 'FFCCCCCC' } },
    }

    // 数字列右对齐
    if ([...RATE_COLS, ...GUIDE_COLS, '航程(天)'].includes(col)) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      cell.numFmt = '#,##0'
    } else if (['截关日', '开航日', '有效期'].includes(col)) {
      cell.numFmt = 'yyyy-mm-dd'
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else if (['中转/直航'].includes(col)) {
      // 下拉验证
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"直航,中转"'],
        showErrorMessage: true,
        errorTitle: '输入有误',
        error: '请选择：直航 或 中转',
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else if (['舱位状态'].includes(col)) {
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"充足,一般,紧张,爆舱"'],
        showErrorMessage: true,
        errorTitle: '输入有误',
        error: '请选择舱位状态',
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else if (['币别'].includes(col)) {
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"USD,CNY,EUR"'],
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      cell.alignment = { vertical: 'middle' }
    }
  })
}

// ---------- 保存 ----------
import fs from 'fs'
const dir = path.dirname(OUT)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

await wb.xlsx.writeFile(OUT)
console.log('✅ 模板已生成：', OUT)
