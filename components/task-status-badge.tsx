import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

interface TaskStatusBadgeProps {
  status: TaskStatus
}

const CONFIG: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  processing: {
    label: '处理中',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500 animate-pulse',
  },
  review: {
    label: '待确认',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  done: {
    label: '已完成',
    className: 'bg-green-50 text-green-700 border-green-200',
    dot: 'bg-green-500',
  },
  failed: {
    label: '失败',
    className: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
}

export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const { label, className, dot } = CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border font-medium', className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full inline-block', dot)} />
      {label}
    </span>
  )
}
