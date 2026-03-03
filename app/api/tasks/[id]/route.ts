import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { mockTasks, mockTemplates, mockSourceFiles, mockCells } from '@/lib/mock-store'

const IS_MOCK = process.env.USE_MOCK === 'true'

// GET /api/tasks/[id] — 获取单个任务（含模板）
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const task = mockTasks.find((t) => t.id === id)
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    return NextResponse.json({
      ...task,
      template: mockTemplates.find((tpl) => tpl.id === task.template_id) ?? null,
      source_files: mockSourceFiles.filter((sf) => sf.task_id === id),
    })
  }

  const db = createServerClient()

  const { data, error } = await db
    .from('tasks')
    .select(`
      *,
      template:templates(id, route_name, columns),
      source_files(*)
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/tasks/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const idx = mockTasks.findIndex((t) => t.id === id)
    if (idx !== -1) mockTasks.splice(idx, 1)
    return NextResponse.json({ success: true })
  }

  const db = createServerClient()

  const { error } = await db.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
