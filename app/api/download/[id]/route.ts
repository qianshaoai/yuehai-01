import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateExcel } from '@/lib/excel-gen'
import type { RowResult } from '@/lib/ai-extract'
import { mockTasks, mockTemplates, mockCells } from '@/lib/mock-store'

export const maxDuration = 60

const IS_MOCK = process.env.USE_MOCK === 'true'

// POST /api/download/[id] — 生成 Excel 并返回文件流
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const task = mockTasks.find((t) => t.id === id)
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

    const tpl = mockTemplates.find((t) => t.id === task.template_id)
    if (!tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })

    const cells = mockCells.filter((c) => c.task_id === id)
    if (cells.length === 0) return NextResponse.json({ error: '提取结果不存在' }, { status: 404 })

    const rowMap: Record<number, RowResult> = {}
    for (const cell of cells) {
      if (!rowMap[cell.row_index]) rowMap[cell.row_index] = { row: cell.row_index, cells: {} }
      rowMap[cell.row_index].cells[cell.column_key] = {
        value: cell.value,
        confidence: cell.confidence ?? 1,
        risk_level: cell.risk_level,
        note: cell.note ?? '',
      }
    }
    const rows = Object.values(rowMap).sort((a, b) => a.row - b.row)

    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const filename = `跃海_${tpl.route_name}航线_${dateStr}_${id.slice(-6)}.xlsx`

    const excelBuffer = await generateExcel({ columns: tpl.columns, rows, routeName: tpl.route_name, taskId: id })

    task.status = 'done'
    task.output_file_url = filename
    task.updated_at = now.toISOString()

    return new NextResponse(excelBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  }

  const db = createServerClient()

  // 1. 获取任务 + 模板
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('*, template:templates(*)')
    .eq('id', id)
    .single()

  if (taskErr) {
    console.error('[POST /api/download] task query error:', taskErr.message)
    return NextResponse.json({ error: `任务查询失败: ${taskErr.message}` }, { status: 500 })
  }
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const columns: string[] = task.template.columns
  const routeName: string = task.template.route_name

  // 2. 获取所有提取结果
  const { data: cells, error: cellErr } = await db
    .from('extracted_cells')
    .select('*')
    .eq('task_id', id)
    .order('row_index', { ascending: true })

  if (cellErr) {
    console.error('[POST /api/download] cells query error:', cellErr.message)
    return NextResponse.json({ error: `结果查询失败: ${cellErr.message}` }, { status: 500 })
  }
  if (!cells || cells.length === 0) return NextResponse.json({ error: '提取结果不存在' }, { status: 404 })

  // 3. 重组为 RowResult[]
  const rowMap: Record<number, RowResult> = {}
  for (const cell of cells) {
    if (!rowMap[cell.row_index]) {
      rowMap[cell.row_index] = { row: cell.row_index, cells: {} }
    }
    rowMap[cell.row_index].cells[cell.column_key] = {
      value: cell.value,
      confidence: cell.confidence ?? 1,
      risk_level: cell.risk_level,
      note: cell.note ?? '',
    }
  }
  const rows = Object.values(rowMap).sort((a, b) => a.row - b.row)

  // 4. 尝试加载原始模板文件（用于保留表头样式）
  let templateBuffer: Buffer | undefined
  try {
    const { data: tplFile } = await db.storage
      .from('templates')
      .download(task.template.template_file_url)
    if (tplFile) {
      templateBuffer = Buffer.from(await tplFile.arrayBuffer())
    }
  } catch {
    // 无模板文件则不使用
  }

  // 5. 生成 Excel
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const filename = `跃海_${routeName}航线_${dateStr}_${id.slice(-6)}.xlsx`

  const excelBuffer = await generateExcel({ columns, rows, routeName, taskId: id, templateBuffer })

  // 6. 上传到 output-files 桶，并更新任务记录
  const outputPath = `output-files/${id}/${filename}`
  const outputBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await db.storage.from('output-files').upload(outputPath, outputBlob, { upsert: true })
  await db.from('tasks').update({
    status: 'done',
    output_file_url: outputPath,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // 7. 直接返回文件流
  return new NextResponse(excelBuffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}

// GET /api/download/[id] — 重新下载已生成的 Excel（通过签名链接）
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    // Mock 模式下重新触发生成并直接返回文件
    const fakeReq = new Request(`http://localhost/api/download/${id}`, { method: 'POST' })
    return POST(fakeReq as NextRequest, { params: Promise.resolve({ id }) })
  }

  const db = createServerClient()

  const { data: task, error } = await db
    .from('tasks')
    .select('output_file_url, status')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[GET /api/download] task query error:', error.message)
    return NextResponse.json({ error: `任务查询失败: ${error.message}` }, { status: 500 })
  }
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (!task.output_file_url) return NextResponse.json({ error: '文件尚未生成，请先确认并下载' }, { status: 404 })

  const { data: signed, error: signErr } = await db.storage
    .from('output-files')
    .createSignedUrl(task.output_file_url, 300)

  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl })
}
