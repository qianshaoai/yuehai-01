'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, FileText, Image as ImageIcon, FileType, ChevronRight, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Template } from '@/types'

interface UploadedFile {
  id: string
  file: File
  type: 'pdf' | 'image' | 'docx' | 'unknown'
}

function getFileType(file: File): UploadedFile['type'] {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.match(/\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/)) return 'image'
  if (name.match(/\.(doc|docx)$/)) return 'docx'
  return 'unknown'
}

function FileTypeIcon({ type }: { type: UploadedFile['type'] }) {
  if (type === 'pdf') return <FileText className="w-4 h-4 text-red-500" />
  if (type === 'image') return <ImageIcon className="w-4 h-4 text-green-500" />
  if (type === 'docx') return <FileType className="w-4 h-4 text-blue-500" />
  return <FileText className="w-4 h-4 text-gray-400" />
}

export default function NewTaskPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then(setTemplates)
      .catch(console.error)
  }, [])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      type: getFileType(f),
    }))
    setFiles((prev) => [...prev, ...arr])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  async function handleSubmit() {
    if (files.length === 0 || !selectedTemplate) return
    setIsSubmitting(true)
    setSubmitError(null)

    const validFiles = files.filter((f) => f.type !== 'unknown')
    if (validFiles.length === 0) {
      setSubmitError('没有支持的文件格式')
      setIsSubmitting(false)
      return
    }

    // 单文件最大 50MB 检查
    const oversized = validFiles.filter((f) => f.file.size > 50 * 1024 * 1024)
    if (oversized.length > 0) {
      setSubmitError(`文件过大（最大 50MB）：${oversized.map((f) => f.file.name).join('、')}`)
      setIsSubmitting(false)
      return
    }

    const toastId = toast.loading(`正在上传 ${validFiles.length} 个文件...`)
    try {
      const formData = new FormData()
      formData.append('templateId', selectedTemplate.id)
      for (const f of validFiles) formData.append('files', f.file)

      const createRes = await fetch('/api/tasks', { method: 'POST', body: formData })
      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error ?? '创建任务失败')
      }
      const { taskId } = await createRes.json()
      toast.success('文件上传完成，开始 AI 处理', { id: toastId })
      router.push(`/tasks/${taskId}/progress`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建任务失败'
      setSubmitError(msg)
      toast.error(msg, { id: toastId })
      setIsSubmitting(false)
    }
  }

  const canSubmit = files.filter((f) => f.type !== 'unknown').length > 0 && selectedTemplate !== null
  const hasUnknown = files.some((f) => f.type === 'unknown')

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">新建任务</h1>
        <p className="text-sm text-gray-500 mt-0.5">上传原始材料，选择航线模板，AI 自动提取并生成 Excel</p>
      </div>

      {/* Step 1 */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-medium">1</span>
          <span className="font-medium text-gray-900">上传原始材料</span>
          <span className="text-xs text-gray-400 ml-1">支持 PDF、图片（JPG/PNG）、Word（docx），可多选</span>
        </div>

        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragging ? 'border-[#2563EB] bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">拖拽文件到此处，或 <span className="text-[#2563EB] font-medium">点击选择</span></p>
          <p className="text-xs text-gray-400 mt-1">PDF · JPG · PNG · DOCX · 单次最多 20 个文件</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.gif,.bmp,.webp"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                <FileTypeIcon type={f.type} />
                <span className="flex-1 text-sm text-gray-800 truncate">{f.file.name}</span>
                <span className="text-xs text-gray-400">{(f.file.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((x) => x.id !== f.id)) }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {hasUnknown && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600">
            <AlertCircle className="w-3.5 h-3.5" />
            存在不支持的文件格式，将被忽略
          </div>
        )}
      </div>

      {/* Step 2 */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-medium">2</span>
          <span className="font-medium text-gray-900">选择航线模板</span>
        </div>

        {templates.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6">
            暂无可用模板，请先前往「模板管理」上传模板
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl)}
                className={cn(
                  'text-left p-3 rounded-lg border-2 transition-all',
                  selectedTemplate?.id === tpl.id
                    ? 'border-[#2563EB] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                )}
              >
                <div className="font-medium text-sm text-gray-900">{tpl.route_name}航线</div>
                <div className="text-xs text-gray-500 mt-0.5">{tpl.columns.length} 个字段</div>
              </button>
            ))}
          </div>
        )}

        {selectedTemplate && (
          <div className="mt-3 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700">
            已选：<span className="font-medium">{selectedTemplate.route_name}航线</span> — {selectedTemplate.columns.length} 个字段列
          </div>
        )}
      </div>

      {submitError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          className="gap-1.5 bg-[#2563EB] hover:bg-blue-700"
          disabled={!canSubmit || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" />提交中...</>
          ) : (
            <>开始生成<ChevronRight className="w-4 h-4" /></>
          )}
        </Button>
        {!canSubmit && (
          <p className="text-xs text-gray-400">
            {files.filter((f) => f.type !== 'unknown').length === 0 ? '请先上传支持格式的文件' : '请选择航线模板'}
          </p>
        )}
      </div>
    </div>
  )
}
