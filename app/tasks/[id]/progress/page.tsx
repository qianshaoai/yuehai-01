'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { CheckCircle2, Circle, Loader2, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Step {
  key: string
  label: string
  description: string
}

const STEPS: Step[] = [
  { key: 'upload',   label: '文件上传',     description: '将原始材料上传至存储空间' },
  { key: 'parse',    label: '文档解析',     description: '提取 PDF、图片、Word 中的文本与表格' },
  { key: 'extract',  label: 'AI 字段提取',  description: '按模板字段进行结构化提取与理解' },
  { key: 'merge',    label: '多文件合并',   description: '合并多来源数据，检测冲突与缺失' },
  { key: 'validate', label: '校验与风险标注', description: '执行基础规则校验，标注高/中风险字段' },
]

// 每步的预计最长停留时间（ms），用于动画推进
const STEP_DURATIONS = [3000, 15000, 30000, 5000, 5000]

type StepStatus = 'pending' | 'running' | 'done' | 'error'

export default function ProgressPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const taskId = params.id

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    STEPS.map((_, i) => (i === 0 ? 'running' : 'pending'))
  )
  const [currentStep, setCurrentStep] = useState(0)
  const [failed, setFailed] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState(false)

  const processCalled = useRef(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentStepRef = useRef(0)

  // 步骤动画：根据当前步骤自动推进（不超过倒数第二步，等待真实结果）
  function scheduleNextStep(step: number) {
    if (step >= STEPS.length - 1) return
    stepTimer.current = setTimeout(() => {
      const next = step + 1
      setStepStatuses((prev) => {
        const s = [...prev]
        s[step] = 'done'
        s[next] = 'running'
        return s
      })
      setCurrentStep(next)
      currentStepRef.current = next
      scheduleNextStep(next)
    }, STEP_DURATIONS[step])
  }

  // 轮询任务状态
  function pollStatus() {
    pollTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`)
        if (!res.ok) throw new Error('查询失败')
        const task = await res.json()

        if (task.status === 'review' || task.status === 'done') {
          // 完成：停止动画，标记所有步骤完成
          if (stepTimer.current) clearTimeout(stepTimer.current)
          setStepStatuses(STEPS.map(() => 'done'))
          setDone(true)
          return
        }
        if (task.status === 'failed') {
          // 失败：停止动画，标记当前步为错误
          if (stepTimer.current) clearTimeout(stepTimer.current)
          setStepStatuses((prev) => {
            const s = [...prev]
            const idx = s.findIndex((x) => x === 'running')
            if (idx >= 0) s[idx] = 'error'
            return s
          })
          setFailed(true)
          setErrorMsg(task.error_message ?? '处理失败，请重试')
          return
        }
        // 仍在处理中，继续轮询
        pollStatus()
      } catch {
        pollStatus()
      }
    }, 3000)
  }

  useEffect(() => {
    // 动画和轮询每次 mount 都重启（兼容 React StrictMode 的 unmount→remount）
    scheduleNextStep(0)
    pollStatus()

    // POST 只触发一次（processCalled 跨 StrictMode remount 保持值）
    if (!processCalled.current) {
      processCalled.current = true
      fetch(`/api/tasks/${taskId}/process`, { method: 'POST' })
        .then((res) => {
          if (!res.ok && res.status !== 202) {
            return res.json().catch(() => null).then((body) => {
              throw new Error(body?.error ?? `处理请求失败 (${res.status})`)
            })
          }
        })
        .catch((err) => {
          if (stepTimer.current) clearTimeout(stepTimer.current)
          if (pollTimer.current) clearTimeout(pollTimer.current)
          setStepStatuses((prev) => {
            const s = [...prev]
            const idx = s.findIndex((x) => x === 'running')
            if (idx >= 0) s[idx] = 'error'
            return s
          })
          setFailed(true)
          setErrorMsg(err instanceof Error ? err.message : '未知错误')
        })
    }

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current)
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const progressPct = failed
    ? (stepStatuses.filter((s) => s === 'done').length / STEPS.length) * 100
    : done
    ? 100
    : ((currentStep + 1) / STEPS.length) * 100

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">处理进度</h1>
        <p className="text-sm text-gray-500 mt-0.5">任务 ID：{taskId}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-700">
              {failed ? '处理失败' : done ? '处理完成' : 'AI 正在处理中...'}
            </span>
            <span className="text-sm text-gray-500">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                failed ? 'bg-red-500' : done ? 'bg-green-500' : 'bg-[#2563EB]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const status = stepStatuses[i]
            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {status === 'done'    && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {status === 'running' && <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />}
                  {status === 'error'   && <AlertCircle className="w-5 h-5 text-red-500" />}
                  {status === 'pending' && <Circle className="w-5 h-5 text-gray-300" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${
                    status === 'pending' ? 'text-gray-400'
                    : status === 'error' ? 'text-red-600'
                    : 'text-gray-800'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                  {status === 'error' && errorMsg && (
                    <p className="text-xs text-red-500 mt-1">{errorMsg}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3">
          {done && (
            <Button
              className="bg-[#2563EB] hover:bg-blue-700"
              onClick={() => router.push(`/tasks/${taskId}/review`)}
            >
              查看结果
            </Button>
          )}
          {failed && (
            <>
              <Button variant="outline" onClick={() => { processCalled.current = false; window.location.reload() }}>
                重试
              </Button>
              <Button variant="ghost" className="text-red-500" onClick={() => router.push('/')}>
                <X className="w-4 h-4 mr-1" />放弃
              </Button>
            </>
          )}
          {!done && !failed && (
            <Button variant="ghost" className="text-gray-500" onClick={() => router.push('/')}>
              返回列表（后台继续处理）
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
