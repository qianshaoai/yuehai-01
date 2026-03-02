'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Trash2, Eye, Download, RefreshCcw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TaskStatusBadge } from '@/components/task-status-badge'
import { RiskSummary } from '@/components/risk-badge'
import type { Task, TaskStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '处理中', value: 'processing' },
  { label: '待确认', value: 'review' },
  { label: '已完成', value: 'done' },
  { label: '失败', value: 'failed' },
]

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const fetchTasks = useCallback(async (silent = false) => {
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) throw new Error(await res.text())
      setTasks(await res.json())
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败'
      setError(msg)
      if (!silent) toast.error(`加载任务失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    // 每10秒静默轮询（检测处理中任务状态变化）
    const timer = setInterval(() => fetchTasks(true), 10000)
    return () => clearInterval(timer)
  }, [fetchTasks])

  const filtered = tasks.filter((t) => {
    const matchSearch =
      !search || t.id.includes(search) || (t.template?.route_name ?? '').includes(search)
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  async function handleDelete(id: string) {
    if (!confirm('确认删除此任务？相关文件和结果也将一并删除。')) return
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '删除失败')
      }
      setTasks((prev) => prev.filter((t) => t.id !== id))
      toast.success('任务已删除')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function handleRedownload(id: string) {
    const toastId = toast.loading('获取下载链接...')
    try {
      const res = await fetch(`/api/download/${id}`)
      if (!res.ok) throw new Error('获取下载链接失败')
      const { url } = await res.json()
      window.open(url, '_blank')
      toast.success('下载链接已打开', { id: toastId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败', { id: toastId })
    }
  }

  async function handleRetry(id: string) {
    const toastId = toast.loading('重新提交处理...')
    try {
      const res = await fetch(`/api/tasks/${id}/process`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '提交失败')
      }
      toast.success('已重新提交，请稍候', { id: toastId })
      fetchTasks(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重试失败', { id: toastId })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">任务列表</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {tasks.length} 个任务</p>
        </div>
        <Link href="/tasks/new">
          <Button className="gap-1.5 bg-[#2563EB] hover:bg-blue-700">
            <Plus className="w-4 h-4" />新建任务
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索任务 ID / 航线..."
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`text-xs px-3 py-1 rounded-md border font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-[#2563EB] text-white border-[#2563EB]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          size="sm" variant="ghost"
          onClick={() => fetchTasks()}
          className="ml-auto h-8 text-xs gap-1 text-gray-500"
        >
          <RefreshCcw className="w-3.5 h-3.5" />刷新
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>加载失败：{error}</span>
          <Button size="sm" variant="ghost" className="text-red-600 h-6" onClick={() => fetchTasks()}>重试</Button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />加载中...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-80">任务 ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">航线模板</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">风险</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">创建时间</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-44">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">
                    {tasks.length === 0
                      ? '暂无任务，点击「新建任务」开始使用'
                      : '无匹配的任务'}
                  </td>
                </tr>
              )}
              {filtered.map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{task.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">
                      {task.template?.route_name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TaskStatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskSummary red={task.risk_count_red} yellow={task.risk_count_yellow} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatTime(task.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(task.status === 'review' || task.status === 'done') && (
                        <Link href={`/tasks/${task.id}/review`}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                            <Eye className="w-3.5 h-3.5" />查看
                          </Button>
                        </Link>
                      )}
                      {task.status === 'processing' && (
                        <Link href={`/tasks/${task.id}/progress`}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                            <Eye className="w-3.5 h-3.5" />进度
                          </Button>
                        </Link>
                      )}
                      {task.status === 'done' && task.output_file_url && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-blue-600"
                          onClick={() => handleRedownload(task.id)}
                        >
                          <Download className="w-3.5 h-3.5" />下载
                        </Button>
                      )}
                      {task.status === 'failed' && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-orange-600"
                          onClick={() => handleRetry(task.id)}
                        >
                          <RefreshCcw className="w-3.5 h-3.5" />重试
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                        disabled={deletingIds.has(task.id)}
                        onClick={() => handleDelete(task.id)}
                      >
                        {deletingIds.has(task.id)
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
