import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'

// GET /api/templates — 获取所有模板
export async function GET() {
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
  const db = createServerClient()

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
  const buffer = Buffer.from(arrayBuf)

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

  // 上传到 Supabase Storage
  const storagePath = `templates/${Date.now()}_${file.name}`
  const { error: storageError } = await db.storage
    .from('templates')
    .upload(storagePath, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  if (storageError) {
    return NextResponse.json({ error: `文件存储失败: ${storageError.message}` }, { status: 500 })
  }

  // 写入数据库
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
