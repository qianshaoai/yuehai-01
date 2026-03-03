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
  try {
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

  // 创建任务记录（若模板不存在，FK 约束会返回明确错误）
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .insert({ template_id: templateId, status: 'processing' })
    .select()
    .single()

  if (taskErr) {
    console.error('[POST /api/tasks] insert task error:', taskErr.message)
    return NextResponse.json({ error: taskErr.message }, { status: 500 })
  }

  // 上传所有原始文件到 Storage 并记录
  const sourceFileRecords = []
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = ['pdf'].includes(ext) ? 'pdf'
      : ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'].includes(ext) ? 'image'
      : ['doc', 'docx'].includes(ext) ? 'docx'
      : null

    if (!fileType) continue // 跳过不支持的格式

    const arrayBuf = await file.arrayBuffer()
    // 用 UUID + 扩展名作为存储路径，避免中文/特殊字符导致 Storage 上传失败
    const safeExt = ext || 'bin'
    const storagePath = `source-files/${task.id}/${crypto.randomUUID()}.${safeExt}`
    const fileBlob = new Blob([arrayBuf], { type: file.type || 'application/octet-stream' })

    const { error: uploadErr } = await db.storage
      .from('source-files')
      .upload(storagePath, fileBlob, { upsert: false })

    if (uploadErr) {
      console.error(`[POST /api/tasks] 上传文件 ${file.name} 失败:`, uploadErr.message)
      continue
    }

    sourceFileRecords.push({
      task_id: task.id,
      file_name: file.name,       // 保留原始文件名用于展示
      file_type: fileType,
      file_url: storagePath,      // 存储实际路径（UUID 命名）
    })
  }

  if (sourceFileRecords.length === 0) {
    // 所有文件上传均失败，删除刚创建的任务，返回错误
    await db.from('tasks').delete().eq('id', task.id)
    return NextResponse.json({ error: '文件上传至存储空间失败，请检查网络或重试' }, { status: 500 })
  }

  const { error: sfErr } = await db.from('source_files').insert(sourceFileRecords)
  if (sfErr) {
    console.error('[POST /api/tasks] source_files insert error:', sfErr.message)
    await db.from('tasks').delete().eq('id', task.id)
    return NextResponse.json({ error: `文件记录保存失败: ${sfErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ taskId: task.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/tasks] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
