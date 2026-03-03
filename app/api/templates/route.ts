import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'
import { mockTemplates } from '@/lib/mock-store'
import type { Template } from '@/types'

const IS_MOCK = process.env.USE_MOCK === 'true'

// GET /api/templates — 获取所有模板
export async function GET() {
  if (IS_MOCK) {
    const sorted = [...mockTemplates].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return NextResponse.json(sorted)
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/templates — 上传新模板（multipart/form-data）
// Fields: routeName (string), file (xlsx file)
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const routeName = formData.get('routeName') as string
  const file = formData.get('file') as File | null

  if (!routeName?.trim()) {
    return NextResponse.json({ error: '航线名称不能为空' }, { status: 400 })
  }
  if (!file) {
    return NextResponse.json({ error: '请上传模板文件' }, { status: 400 })
  }
  if (!file.name.endsWith('.xlsx')) {
    return NextResponse.json({ error: '只支持 .xlsx 格式' }, { status: 400 })
  }

  const arrayBuf = await file.arrayBuffer()

  // 解析表头（第一行列名）
  let columns: string[] = []
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuf)
    const sheet = workbook.worksheets[0]
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      const val = String(cell.value ?? '').trim()
      if (val) columns.push(val)
    })
  } catch {
    return NextResponse.json({ error: '模板文件解析失败，请检查文件格式' }, { status: 400 })
  }

  if (columns.length === 0) {
    return NextResponse.json({ error: '模板文件第一行未找到列名' }, { status: 400 })
  }

  if (IS_MOCK) {
    const newTpl: Template = {
      id: `tpl-mock-${Date.now()}`,
      route_name: routeName.trim(),
      template_file_url: '',
      sheet_name: 'Sheet1',
      header_row_index: 1,
      columns,
      version: 'current',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockTemplates.unshift(newTpl)
    return NextResponse.json(newTpl, { status: 201 })
  }

  const db = createServerClient()

  const storagePath = `templates/${Date.now()}_${file.name}`
  const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const { error: storageError } = await db.storage
    .from('templates')
    .upload(storagePath, blob, { upsert: false })

  if (storageError) {
    return NextResponse.json({ error: `文件存储失败: ${storageError.message}` }, { status: 500 })
  }

  const { data, error } = await db
    .from('templates')
    .insert({
      route_name: routeName.trim(),
      template_file_url: storagePath,
      columns,
      version: 'current',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
