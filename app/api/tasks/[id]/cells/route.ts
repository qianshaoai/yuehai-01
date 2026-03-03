import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { mockCells, mockTasks } from '@/lib/mock-store'

const IS_MOCK = process.env.USE_MOCK === 'true'

// GET /api/tasks/[id]/cells — 获取该任务所有提取结果
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const cells = mockCells
      .filter((c) => c.task_id === id)
      .sort((a, b) => a.row_index - b.row_index || a.column_key.localeCompare(b.column_key))
    return NextResponse.json(cells)
  }

  const db = createServerClient()

  const { data, error } = await db
    .from('extracted_cells')
    .select('*')
    .eq('task_id', id)
    .order('row_index', { ascending: true })
    .order('column_key', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PATCH /api/tasks/[id]/cells — 更新单元格（手动编辑）
// Body: { rowIndex, columnKey, value }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const body = await req.json()
  const { rowIndex, columnKey, value } = body

  if (rowIndex === undefined || !columnKey) {
    return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  }

  const strValue = String(value ?? '').trim()
  const REQUIRED_FIELDS = ['起运港', '目的港', '开航日', '截关日']

  if (IS_MOCK) {
    const cell = mockCells.find(
      (c) => c.task_id === id && c.row_index === rowIndex && c.column_key === columnKey
    )
    if (!cell) return NextResponse.json({ error: '单元格不存在' }, { status: 404 })

    if (REQUIRED_FIELDS.includes(columnKey) && strValue && cell.risk_level === 'red') {
      cell.risk_level = 'none'
    }
    cell.value = strValue
    cell.is_manually_edited = true
    cell.updated_at = new Date().toISOString()

    // 重新统计并更新任务
    const taskCells = mockCells.filter((c) => c.task_id === id)
    const task = mockTasks.find((t) => t.id === id)
    if (task) {
      task.risk_count_red = taskCells.filter((c) => c.risk_level === 'red').length
      task.risk_count_yellow = taskCells.filter((c) => c.risk_level === 'yellow').length
      task.updated_at = new Date().toISOString()
    }

    return NextResponse.json(cell)
  }

  const db = createServerClient()

  // 先查当前 risk_level
  const { data: existing } = await db
    .from('extracted_cells')
    .select('risk_level')
    .eq('task_id', id)
    .eq('row_index', rowIndex)
    .eq('column_key', columnKey)
    .single()

  let newRiskLevel = existing?.risk_level ?? 'none'
  if (REQUIRED_FIELDS.includes(columnKey) && strValue && existing?.risk_level === 'red') {
    newRiskLevel = 'none'
  }

  const { data, error } = await db
    .from('extracted_cells')
    .update({
      value: strValue,
      is_manually_edited: true,
      risk_level: newRiskLevel,
      updated_at: new Date().toISOString(),
    })
    .eq('task_id', id)
    .eq('row_index', rowIndex)
    .eq('column_key', columnKey)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 重新统计风险数量并更新任务
  const { data: allCells } = await db
    .from('extracted_cells')
    .select('risk_level')
    .eq('task_id', id)

  const redCount = allCells?.filter((c) => c.risk_level === 'red').length ?? 0
  const yellowCount = allCells?.filter((c) => c.risk_level === 'yellow').length ?? 0

  await db.from('tasks').update({
    risk_count_red: redCount,
    risk_count_yellow: yellowCount,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json(data)
}
