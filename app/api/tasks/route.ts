import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { mockTasks, mockTemplates, mockSourceFiles } from '@/lib/mock-store'

const IS_MOCK = process.env.USE_MOCK === 'true'

// GET /api/tasks — 获取所有任务（含模板信息）
export async function GET() {
  if (IS_MOCK) {
    const tasks = [...mockTasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((t) => ({
        ...t,
        template: mockTemplates.find((tpl) => tpl.id === t.template_id) ?? null,
      }))
    return NextResponse.json(tasks)
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('tasks')
    .select(`
      *,
      template:templates(id, route_name, columns)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/tasks — 创建任务（multipart/form-data）
// Fields: templateId, files[]
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const templateId = formData.get('templateId') as string
  const files = formData.getAll('files') as File[]

  if (!templateId) return NextResponse.json({ error: '请选择模板' }, { status: 400 })
  if (!files.length) return NextResponse.json({ error: '请上传文件' }, { status: 400 })

  if (IS_MOCK) {
    const tpl = mockTemplates.find((t) => t.id === templateId)
    if (!tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })

    const taskId = `task-mock-${Date.now()}`
    const now = new Date().toISOString()
    const newTask = {
      id: taskId,
      template_id: templateId,
      template: tpl,
      status: 'processing' as const,
      risk_count_red: 0,
      risk_count_yellow: 0,
      created_at: now,
      updated_at: now,
    }
    mockTasks.unshift(newTask)

    // 记录上传的文件名（不实际存储内容）
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const fileType = ['pdf'].includes(ext) ? 'pdf'
        : ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext) ? 'image'
        : ['doc', 'docx'].includes(ext) ? 'docx'
        : null
      if (!fileType) continue
      mockSourceFiles.push({
        id: `sf-mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        task_id: taskId,
        file_name: file.name,
        file_type: fileType,
        file_url: '',
        created_at: now,
      })
    }

    return NextResponse.json({ taskId }, { status: 201 })
  }

  const db = createServerClient()

  // 验证模板存在
  const { data: tpl, error: tplErr } = await db.from('templates').select('id').eq('id', templateId).single()
  if (tplErr || !tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 })

  // 创建任务记录
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .insert({ template_id: templateId, status: 'processing' })
    .select()
    .single()

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  // 上传所有原始文件到 Storage 并记录
  const sourceFileRecords = []
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = ['pdf'].includes(ext) ? 'pdf'
      : ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'].includes(ext) ? 'image'
      : ['doc', 'docx'].includes(ext) ? 'docx'
      : null

    if (!fileType) continue // 跳过不支持的格式

    const buffer = Buffer.from(await file.arrayBuffer())
    const storagePath = `source-files/${task.id}/${Date.now()}_${file.name}`

    const { error: uploadErr } = await db.storage
      .from('source-files')
      .upload(storagePath, buffer, { contentType: file.type })

    if (uploadErr) continue // 单文件上传失败不中断整体

    sourceFileRecords.push({
      task_id: task.id,
      file_name: file.name,
      file_type: fileType,
      file_url: storagePath,
    })
  }

  if (sourceFileRecords.length > 0) {
    await db.from('source_files').insert(sourceFileRecords)
  }

  return NextResponse.json({ taskId: task.id }, { status: 201 })
}
