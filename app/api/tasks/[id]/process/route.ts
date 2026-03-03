import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { extractFromFiles, type FileContent } from '@/lib/ai-extract'
import { parsePdf } from '@/lib/parse-pdf'
import { parseDocx } from '@/lib/parse-docx'
import { mockTasks, mockCells, cloneCellsForTask } from '@/lib/mock-store'

// 允许更长的执行时间（处理文件 + AI 调用）
export const maxDuration = 120

const IS_MOCK = process.env.USE_MOCK === 'true'

// POST /api/tasks/[id]/process — 触发 AI 解析流程
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (IS_MOCK) {
    const task = mockTasks.find((t) => t.id === id)
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    if (task.status === 'done') return NextResponse.json({ error: '任务已完成' }, { status: 400 })

    // 模拟处理延迟
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // 生成 mock 提取结果（如果该任务还没有 cells）
    const existing = mockCells.filter((c) => c.task_id === id)
    if (existing.length === 0) {
      const newCells = cloneCellsForTask(id)
      mockCells.push(...newCells)
    }

    const taskCells = mockCells.filter((c) => c.task_id === id)
    const redCount = taskCells.filter((c) => c.risk_level === 'red').length
    const yellowCount = taskCells.filter((c) => c.risk_level === 'yellow').length

    task.status = 'review'
    task.risk_count_red = redCount
    task.risk_count_yellow = yellowCount
    task.updated_at = new Date().toISOString()

    return NextResponse.json({ success: true, rowCount: 2, redCount, yellowCount })
  }

  const db = createServerClient()

  // 1. 获取任务 + 模板 + 原始文件
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('*, template:templates(*), source_files(*)')
    .eq('id', id)
    .single()

  if (taskErr) {
    console.error('[process] Supabase query error:', taskErr)
    return NextResponse.json({ error: `查询失败: ${taskErr.message}` }, { status: 500 })
  }
  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  }
  if (task.status === 'done') {
    return NextResponse.json({ error: '任务已完成' }, { status: 400 })
  }

  if (!task.template) {
    console.error('[process] task.template is null for task:', id)
    return NextResponse.json({ error: '模板信息缺失，请重新创建任务' }, { status: 500 })
  }

  const columns: string[] = task.template.columns

  // 2. 更新状态为 processing
  await db.from('tasks').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id)

  try {
    // 3. 下载所有原始文件并准备 AI 输入
    const fileContents: FileContent[] = []
    const sourceFiles = Array.isArray(task.source_files) ? task.source_files : []

    console.log(`[process] task ${id} 共有 ${sourceFiles.length} 个源文件`)

    for (const sf of sourceFiles) {
      const { data: fileData, error: dlErr } = await db.storage
        .from('source-files')
        .download(sf.file_url)

      if (dlErr || !fileData) {
        console.error(`[process] 下载文件失败 ${sf.file_name} (${sf.file_url}):`, dlErr?.message)
        continue
      }
      console.log(`[process] 下载成功: ${sf.file_name}`)

      const buffer = Buffer.from(await fileData.arrayBuffer())

      if (sf.file_type === 'pdf') {
        // 先尝试提取文字层
        let text = ''
        try {
          const parsed = await parsePdf(buffer)
          text = parsed.text
        } catch {
          // 文字提取失败，将使用 buffer 送给 Claude Vision
        }

        // 文字内容少于50字（扫描件）时，使用 PDF 原文件直接给 Claude 理解
        if (text.trim().length < 50) {
          fileContents.push({
            fileName: sf.file_name,
            fileType: 'pdf',
            buffer,
            mimeType: 'application/pdf',
          })
        } else {
          fileContents.push({
            fileName: sf.file_name,
            fileType: 'pdf',
            text,
            buffer,
            mimeType: 'application/pdf',
          })
        }
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
        fileContents.push({
          fileName: sf.file_name,
          fileType: 'docx',
          text: parsed.text,
        })
      }
    }

    if (fileContents.length === 0) {
      throw new Error('没有可处理的文件')
    }

    // 4. 调用 Claude AI 提取字段
    const rows = await extractFromFiles(fileContents, columns)

    if (rows.length === 0) {
      throw new Error('AI 未能从文件中提取到任何数据，请检查文件内容是否与航线模板匹配')
    }

    // 5. 写入提取结果到数据库
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

    // 删除旧的提取结果（重试时覆盖）
    await db.from('extracted_cells').delete().eq('task_id', id)
    await db.from('extracted_cells').insert(cellInserts)

    // 6. 更新任务状态为 review
    await db.from('tasks').update({
      status: 'review',
      risk_count_red: redCount,
      risk_count_yellow: yellowCount,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, rowCount: rows.length, redCount, yellowCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    await db.from('tasks').update({
      status: 'failed',
      error_message: msg,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// 全局兜底：防止未捕获异常返回 Next.js HTML 错误页
export const dynamic = 'force-dynamic'
