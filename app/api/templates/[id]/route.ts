import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'

// DELETE /api/templates/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  // 检查是否有任务正在使用此模板
  const { count } = await db
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('template_id', id)

  if (count && count > 0) {
    return NextResponse.json({ error: '该模板已被任务使用，无法删除' }, { status: 400 })
  }

  const { error } = await db.from('templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/templates/[id] — 替换模板文件
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '请上传新模板文件' }, { status: 400 })

  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  // 解析新表头
  let columns: string[] = []
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuf)
    const sheet = workbook.worksheets[0]
    sheet.getRow(1).eachCell((cell) => {
      const val = String(cell.value ?? '').trim()
      if (val) columns.push(val)
    })
  } catch {
    return NextResponse.json({ error: '模板文件解析失败' }, { status: 400 })
  }

  const storagePath = `templates/${Date.now()}_${file.name}`
  const { error: storageError } = await db.storage
    .from('templates')
    .upload(storagePath, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data, error } = await db
    .from('templates')
    .update({ template_file_url: storagePath, columns, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// GET /api/templates/[id]/download — 下载模板文件（通过鉴权链接）
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: tpl, error } = await db.from('templates').select('template_file_url').eq('id', id).single()
  if (error || !tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })

  const { data: signedUrl, error: urlError } = await db.storage
    .from('templates')
    .createSignedUrl(tpl.template_file_url, 300) // 5分钟有效

  if (urlError) return NextResponse.json({ error: urlError.message }, { status: 500 })
  return NextResponse.json({ url: signedUrl.signedUrl })
}
