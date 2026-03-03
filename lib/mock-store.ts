/**
 * Mock 模式内存状态存储
 * 当 USE_MOCK=true 时，所有 API 路由使用此模块代替 Supabase。
 * 在 dev server 进程内跨请求持久化。
 */
import { MOCK_TEMPLATES, MOCK_TASKS, MOCK_EXTRACTED_CELLS, MOCK_SOURCE_FILES } from './mock-data'
import type { Template, Task, ExtractedCell } from '@/types'

function deepClone<T>(arr: T[]): T[] {
  return arr.map((item) => ({ ...(item as object) } as T))
}

export const mockTemplates: Template[] = deepClone(MOCK_TEMPLATES)
export const mockTasks: Task[] = deepClone(MOCK_TASKS)
export const mockCells: ExtractedCell[] = deepClone(MOCK_EXTRACTED_CELLS)
export const mockSourceFiles = deepClone(MOCK_SOURCE_FILES)

/** 用 task-001 的 cells 为新任务生成一份 mock 提取结果 */
export function cloneCellsForTask(newTaskId: string): ExtractedCell[] {
  const baseCells = MOCK_EXTRACTED_CELLS.filter((c) => c.task_id === 'task-001')
  return baseCells.map((c, i) => ({
    ...c,
    id: `ec-mock-${newTaskId}-${i}`,
    task_id: newTaskId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}
