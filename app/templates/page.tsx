'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, Download, Trash2, Plus, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Template } from '@/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [replaceId, setReplaceId] = useState<string | null>(null)
  const [newRouteName, setNewRouteName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchTemplates() {
    const res = await fetch('/api/templates')
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  function openAdd() {
    setReplaceId(null)
    setNewRouteName('')
    setSelectedFile(null)
    setUploadError(null)
    setUploadSuccess(false)
    setShowDialog(true)
  }

  function openReplace(id: string) {
    setReplaceId(id)
    setSelectedFile(null)
    setUploadError(null)
    setUploadSuccess(false)
    setShowDialog(true)
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (!replaceId && !newRouteName.trim()) { setUploadError('请填写航线名称'); return }
    setUploading(true)
    setUploadError(null)

    const form = new FormData()
    form.append('file', selectedFile)

    let res: Response
    if (replaceId) {
      form.append('templateId', replaceId)
      res = await fetch(`/api/templates/${replaceId}`, { method: 'PATCH', body: form })
    } else {
      form.append('routeName', newRouteName.trim())
      res = await fetch('/api/templates', { method: 'POST', body: form })
    }

    setUploading(false)
    if (!res.ok) {
      const err = await res.json()
      setUploadError(err.error ?? '上传失败')
      toast.error(err.error ?? '上传失败')
      return
    }

    toast.success(replaceId ? '模板已替换' : '新模板上传成功')
    setUploadSuccess(true)
    await fetchTemplates()
    setTimeout(() => {
      setShowDialog(false)
      setUploadSuccess(false)
    }, 1200)
  }

  async function handleDownload(tpl: Template) {
    const toastId = toast.loading('获取下载链接...')
    const res = await fetch(`/api/templates/${tpl.id}`)
    if (!res.ok) { toast.error('获取下载链接失败', { id: toastId }); return }
    const { url } = await res.json()
    window.open(url, '_blank')
    toast.success('下载链接已打开', { id: toastId })
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除此模板？')) return
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      toast.success('模板已删除')
    } else {
      const err = await res.json()
      toast.error(err.error ?? '删除失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">模板管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理各航线 Excel 模板，上传后自动解析表头字段</p>
        </div>
        <Button className="gap-1.5 bg-[#2563EB] hover:bg-blue-700" onClick={openAdd}>
          <Plus className="w-4 h-4" />新增模板
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />加载中...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-base">{tpl.route_name}航线</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">
                        {tpl.version === 'current' ? '当前版' : '上一版'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      最后更新 {formatDate(tpl.updated_at)} · {tpl.columns.length} 个字段列
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tpl.columns.slice(0, 10).map((col, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{col}</span>
                      ))}
                      {tpl.columns.length > 10 && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">+{tpl.columns.length - 10} 更多</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-gray-600" onClick={() => handleDownload(tpl)}>
                    <Download className="w-3.5 h-3.5" />下载
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-blue-600" onClick={() => openReplace(tpl.id)}>
                    <Upload className="w-3.5 h-3.5" />替换
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(tpl.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>暂无模板，请点击「新增模板」上传</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o && !uploading) setShowDialog(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{replaceId ? '替换模板文件' : '新增航线模板'}</DialogTitle>
          </DialogHeader>

          {uploadSuccess ? (
            <div className="flex flex-col items-center py-6 gap-2 text-green-600">
              <CheckCircle2 className="w-10 h-10" />
              <p className="font-medium">上传成功！</p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {!replaceId && (
                <div>
                  <Label htmlFor="route-name">航线名称</Label>
                  <Input
                    id="route-name"
                    placeholder="如：中东、东南亚..."
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label>模板文件（.xlsx）</Label>
                <div
                  className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                      <FileSpreadsheet className="w-4 h-4 text-green-600" />
                      {selectedFile.name}
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">点击选择 Excel 文件</p>
                      <p className="text-xs text-gray-400 mt-0.5">仅支持 .xlsx</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
                    onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])} />
                </div>
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  上传后自动解析第一行表头作为字段列名
                </p>
              </div>

              {uploadError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />{uploadError}
                </p>
              )}

              <Button
                className="w-full bg-[#2563EB] hover:bg-blue-700"
                disabled={!selectedFile || (!replaceId && !newRouteName.trim()) || uploading}
                onClick={handleUpload}
              >
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />上传中...</> : '确认上传'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
