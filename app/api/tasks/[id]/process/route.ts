import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { extractFromFiles, type FileContent } from '@/lib/ai-extract'
import { parsePdf } from '@/lib/parse-pdf'
import { parseDocx } from '@/lib/parse-docx'
import { mockTasks, mockCells, cloneCellsForTask } from '@/lib/mock-store'

export const dynamic = 'force-dynamic'

const IS_MOCK = process.env.USE_MOCK === 'true'

// 后台实际处理逻辑（不阻塞 HTTP 响应）
async function runProcess(id: string) {
  const db = createServerClient()

  try {
    const { data: task, error: taskErr } = await db
      .from('tasks')
      .select('*, template:templates(*), source_files(*)')
      .eq('id', id)
      .single()

    if (taskErr || !task) throw new Error('任务不存在')
    if (!task.template) throw new Error('模板信息缺失，请重新创建任务')

    const columns: string[] = task.template.columns
    const fileContents: FileContent[] = []
    const sourceFiles = Array.isArray(task.source_files) ? task.source_files : []

    console.log(`[process] task ${id} 共有 ${sourceFiles.length} 个源文件`)

    for (const sf of sourceFiles) {
      const { data: fileData, error: dlErr } = await db.storage
        .from('source-files')
        .download(sf.file_url)

      if (dlErr || !fileData) {
        console.error(`[process] 下载文件失败 ${sf.file_name}:`, dlErr?.message)
        continue
      }
      console.log(`[process] 下载成功: ${sf.file_name}`)

      const buffer = Buffer.from(await fileData.arrayBuffer())

      if (sf.file_type === 'pdf') {
        let text = ''
        try {
          const parsed = await parsePdf(buffer)
          text = parsed.text
        } catch { /* 扫描件，无文字层 */ }

        fileContents.push({
          fileName: sf.file_name,
          fileType: 'pdf',
          text: text.trim().length >= 50 ? text : undefined,
          buffer,
          mimeType: 'application/pdf',
        })
      } else if (sf.file_type === 'image') {
        const ext = sf.file_name.split('.').pop()?.toLowerCase() ?? 'jpeg'
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif', webp: 'image/webp',
        }
        fileContents.push({
          fileName: sf.file_name,
          fileType: 'image',
          buffer,
          mimeType: mimeMap[ext] ?? 'image/jpeg',
        })
      } else if (sf.file_type === 'docx') {
        const parsed = await parseDocx(buffer)
        fileContents.push({ fileName: sf.file_name, fileType: 'docx', text: parsed.text })
      }
    }

    if (fileContents.length === 0) throw new Error('没有可处理的文件')

    const rows = await extractFromFiles(fileContents, columns)
    if (rows.length === 0) throw new Error('AI 未能从文件中提取到任何数据，请检查文件内容是否与航线模板匹配')

    const cellInserts = []
    let redCount = 0
    let yellowCount = 0

    for (const row of rows) {
      for (const [colKey, cell] of Object.entries(row.cells)) {
        cellInserts.push({
          task_id: id,
          row_index: row.row,
          column_key: colKey,
          value: cell.value,
          risk_level: cell.risk_level,
          confidence: cell.confidence,
          note: cell.note || null,
          is_manually_edited: false,
        })
        if (cell.risk_level === 'red') redCount++
        else if (cell.risk_level === 'yellow') yellowCount++
      }
    }

    await db.from('extracted_cells').delete().eq('task_id', id)
    const { error: insertError } = await db.from('extracted_cells').insert(cellInserts)
    if (insertError) throw new Error(`保存提取结果失败: ${insertError.message}`)

    await db.from('tasks').update({
      status: 'review',
      risk_count_red: redCount,
      risk_count_yellow: yellowCount,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    console.log(`[process] task ${id} 完成，${rows.length} 行`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    console.error(`[process] task ${id} 失败:`, msg)
    const db2 = createServerClient()
    await db2.from('tasks').update({
      status: 'failed',
      error_message: msg,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }
}

// POST /api/tasks/[id]/process — 立即返回 202，后台异步处理
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const task = mockTasks.find((t) => t.id === id)
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    if (task.status === 'done') return NextResponse.json({ error: '任务已完成' }, { status: 400 })

    await new Promise((resolve) => setTimeout(resolve, 1500))
    const existing = mockCells.filter((c) => c.task_id === id)
    if (existing.length === 0) mockCells.push(...cloneCellsForTask(id))

    const taskCells = mockCells.filter((c) => c.task_id === id)
    task.status = 'review'
    task.risk_count_red = taskCells.filter((c) => c.risk_level === 'red').length
    task.risk_count_yellow = taskCells.filter((c) => c.risk_level === 'yellow').length
    task.updated_at = new Date().toISOString()
    return NextResponse.json({ success: true })
  }

  const db = createServerClient()

  // 校验任务存在
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('id, status, template_id')
    .eq('id', id)
    .single()

  if (taskErr || !task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (task.status === 'done') return NextResponse.json({ error: '任务已完成' }, { status: 400 })

  // 标记为处理中
  await db.from('tasks').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id)

  // 异步后台执行，不阻塞响应
  setImmediate(() => { runProcess(id) })

  return NextResponse.json({ accepted: true }, { status: 202 })
}
