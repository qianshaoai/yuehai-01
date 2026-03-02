'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Download, Pencil, CheckCircle2, Filter, AlertTriangle,
  X, ChevronLeft, Info, Save, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ExtractedCell, Task, Template } from '@/types'

function buildCellMap(cells: ExtractedCell[]) {
  const map: Record<number, Record<string, ExtractedCell>> = {}
  for (const cell of cells) {
    if (!map[cell.row_index]) map[cell.row_index] = {}
    map[cell.row_index][cell.column_key] = cell
  }
  return map
}

function RiskTooltip({ note }: { note: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info className="w-3 h-3 text-current opacity-60 cursor-help" />
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-56 p-2 bg-gray-900 text-white text-xs rounded shadow-lg leading-relaxed whitespace-normal">
          {note}
        </div>
      )}
    </span>
  )
}

interface CellContentProps {
  cell: ExtractedCell | undefined
  isEditing: boolean
  onUpdate: (value: string) => void
  showRiskOnly: boolean
}

function CellContent({ cell, isEditing, onUpdate, showRiskOnly }: CellContentProps) {
  const [editVal, setEditVal] = useState(cell?.value ?? '')

  useEffect(() => {
    setEditVal(cell?.value ?? '')
  }, [cell?.value])

  if (!cell) return <span className="text-gray-300">—</span>
  if (showRiskOnly && cell.risk_level === 'none') return <span className="text-gray-400 text-xs">—</span>

  const riskClass =
    cell.risk_level === 'red' ? 'bg-red-50 text-red-800'
    : cell.risk_level === 'yellow' ? 'bg-yellow-50 text-yellow-800'
    : ''

  if (isEditing) {
    return (
      <div className={cn('flex items-center', riskClass)}>
        <input
          className="w-full bg-transparent outline-none text-sm border-b border-blue-400 focus:border-blue-600"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => onUpdate(editVal)}
        />
        {cell.is_manually_edited && <span className="shrink-0 ml-1 text-xs text-blue-500">已改</span>}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-0.5 px-1 py-0.5 rounded text-sm leading-5', riskClass)}>
      <span className={cn('truncate', !cell.value && 'italic text-gray-400')}>
        {cell.value || '（空）'}
      </span>
      {cell.is_manually_edited && <span className="shrink-0 text-xs text-blue-500 ml-0.5">*</span>}
      {cell.note && cell.risk_level !== 'none' && <RiskTooltip note={cell.note} />}
    </div>
  )
}

export default function ReviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const taskId = params.id

  const [task, setTask] = useState<Task | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [cells, setCells] = useState<ExtractedCell[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [showRiskOnly, setShowRiskOnly] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, cellsRes] = await Promise.all([
          fetch(`/api/tasks/${taskId}`),
          fetch(`/api/tasks/${taskId}/cells`),
        ])
        if (!taskRes.ok) throw new Error('任务不存在')
        const taskData = await taskRes.json()

        // 任务仍在处理中 → 跳转到进度页
        if (taskData.status === 'processing') {
          router.replace(`/tasks/${taskId}/progress`)
          return
        }
        // 任务失败 → 提示并返回列表
        if (taskData.status === 'failed') {
          toast.error('任务处理失败，请重新提交或检查文件')
          router.replace('/')
          return
        }

        const cellsData = cellsRes.ok ? await cellsRes.json() : []
        setTask(taskData)
        setTemplate(taskData.template)
        setCells(Array.isArray(cellsData) ? cellsData : [])
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [taskId, router])

  const cellMap = useMemo(() => buildCellMap(cells), [cells])
  const rows = useMemo(() => [...new Set(cells.map((c) => c.row_index))].sort((a, b) => a - b), [cells])
  const riskCells = cells.filter((c) => c.risk_level !== 'none')
  const redCount = cells.filter((c) => c.risk_level === 'red').length
  const yellowCount = cells.filter((c) => c.risk_level === 'yellow').length

  const updateCell = useCallback(async (rowIndex: number, columnKey: string, value: string) => {
    // Optimistic update
    setCells((prev) =>
      prev.map((c) =>
        c.row_index === rowIndex && c.column_key === columnKey
          ? { ...c, value, is_manually_edited: true }
          : c
      )
    )
    // Persist to API（静默保存，失败时提示）
    const saveRes = await fetch(`/api/tasks/${taskId}/cells`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, columnKey, value }),
    })
    if (!saveRes.ok) {
      toast.error('保存失败，请重试')
      // 回滚
      setCells((prev) =>
        prev.map((c) =>
          c.row_index === rowIndex && c.column_key === columnKey
            ? { ...c, value: c.value, is_manually_edited: c.is_manually_edited }
            : c
        )
      )
    }
  }, [taskId])

  async function handleDownload() {
    if (redCount > 0) {
      const confirm = window.confirm(
        `当前仍有 ${redCount} 个高风险字段未处理，确认继续下载？`
      )
      if (!confirm) return
    }
    setIsDownloading(true)
    const toastId = toast.loading('正在生成 Excel 文件...')
    try {
      const res = await fetch(`/api/download/${taskId}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '生成失败')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disp = res.headers.get('Content-Disposition') ?? ''
      const nameMatch = disp.match(/filename\*=UTF-8''(.+)/)
      a.download = nameMatch ? decodeURIComponent(nameMatch[1]) : `跃海_${taskId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel 已生成并开始下载', { id: toastId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败', { id: toastId })
    } finally {
      setIsDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        加载中...
      </div>
    )
  }

  if (loadError || !task || !template) {
    return (
      <div className="p-6 text-red-600">加载失败：{loadError}</div>
    )
  }

  const visibleColumns = showRiskOnly
    ? template.columns.filter((col) => riskCells.some((c) => c.column_key === col))
    : template.columns

  return (
    <div className="flex flex-col h-[calc(100vh-56px-48px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" />返回
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              结果预览 — {template.route_name}航线
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">任务 {taskId} · {rows.length} 条数据</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            {redCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded border bg-red-50 text-red-700 border-red-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{redCount} 高风险
              </span>
            )}
            {yellowCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded border bg-yellow-50 text-yellow-700 border-yellow-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />{yellowCount} 中风险
              </span>
            )}
            {redCount === 0 && yellowCount === 0 && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />无风险
              </span>
            )}
          </div>

          <Button
            size="sm" variant="outline"
            className={cn('gap-1.5 text-xs', showRiskOnly && 'border-orange-400 text-orange-600 bg-orange-50')}
            onClick={() => setShowRiskOnly((v) => !v)}
          >
            <Filter className="w-3.5 h-3.5" />
            {showRiskOnly ? '显示全部' : '只看风险'}
          </Button>

          {!isEditing ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setIsEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />开启编辑
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-blue-400 text-blue-600" onClick={() => setIsEditing(false)}>
              <Save className="w-3.5 h-3.5" />完成编辑
            </Button>
          )}

          <Button
            size="sm" className="gap-1.5 bg-[#2563EB] hover:bg-blue-700 text-xs"
            onClick={handleDownload} disabled={isDownloading}
          >
            {isDownloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</> : <><Download className="w-3.5 h-3.5" />确认并下载 Excel</>}
          </Button>
        </div>
      </div>

      {/* Risk banner */}
      {(redCount > 0 || yellowCount > 0) && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3 shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <span className="font-medium">请重点核对风险字段：</span>
            {redCount > 0 && <span className="ml-1">红色 {redCount} 个（必填缺失或冲突，需人工确认）</span>}
            {yellowCount > 0 && <span className="ml-1">黄色 {yellowCount} 个（低把握识别，建议核对）</span>}
            <span className="ml-1 text-amber-600">— 悬停字段可查看详细原因</span>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-3 shrink-0">
          <Pencil className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="text-xs text-blue-700">编辑模式已开启，点击单元格内容可修改。已修改字段将标注 <span className="font-mono">*</span></span>
          <button className="ml-auto text-blue-500 hover:text-blue-700" onClick={() => setIsEditing(false)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white border border-gray-200 rounded-lg">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            暂无提取结果
          </div>
        ) : (
          <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="border border-gray-200 bg-gray-100 px-2 py-2 text-gray-500 font-medium w-10 text-center">#</th>
                {visibleColumns.map((col) => {
                  const colRisk = rows.some((r) => cellMap[r]?.[col]?.risk_level === 'red') ? 'red'
                    : rows.some((r) => cellMap[r]?.[col]?.risk_level === 'yellow') ? 'yellow'
                    : 'none'
                  return (
                    <th key={col}
                      className={cn(
                        'border border-gray-200 px-2 py-2 font-medium text-left whitespace-nowrap min-w-[90px] max-w-[160px]',
                        colRisk === 'red' ? 'bg-red-50 text-red-700'
                        : colRisk === 'yellow' ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                      )}>
                      {col}
                      {colRisk === 'red' && <span className="ml-1 text-red-400">●</span>}
                      {colRisk === 'yellow' && <span className="ml-1 text-yellow-400">●</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((rowIdx) => (
                <tr key={rowIdx} className="hover:bg-blue-50/30">
                  <td className="border border-gray-100 bg-gray-50 text-center text-gray-400 font-medium py-1.5">{rowIdx}</td>
                  {visibleColumns.map((col) => {
                    const cell = cellMap[rowIdx]?.[col]
                    const risk = cell?.risk_level ?? 'none'
                    return (
                      <td key={col}
                        className={cn(
                          'border border-gray-100 px-1 py-1 align-middle',
                          risk === 'red' && 'bg-red-50',
                          risk === 'yellow' && 'bg-yellow-50'
                        )}>
                        <CellContent
                          cell={cell}
                          isEditing={isEditing}
                          onUpdate={(val) => updateCell(rowIdx, col, val)}
                          showRiskOnly={showRiskOnly}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-gray-400 shrink-0">
        <span>{rows.length} 行 × {visibleColumns.length} 列{showRiskOnly ? '（风险列筛选中）' : ''}</span>
        <span>预览仅供核对，下载后以 Excel 文件为准</span>
      </div>
    </div>
  )
}
