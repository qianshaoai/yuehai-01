import { cn } from '@/lib/utils'
import type { RiskLevel } from '@/types'

interface RiskBadgeProps {
  level: RiskLevel
  count?: number
  size?: 'sm' | 'md'
}

const CONFIG = {
  red: { label: '高风险', className: 'bg-red-100 text-red-700 border-red-200' },
  yellow: { label: '中风险', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  none: { label: '正常', className: 'bg-green-100 text-green-700 border-green-200' },
}

export function RiskBadge({ level, count, size = 'md' }: RiskBadgeProps) {
  const { label, className } = CONFIG[level]
  return (
    <span
      className={cn(
        'inline-flex items-center border rounded font-medium',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className
      )}
    >
      {count !== undefined ? count : label}
      {count !== undefined && <span className="ml-1 opacity-70">{level === 'red' ? '红' : level === 'yellow' ? '黄' : ''}</span>}
    </span>
  )
}

export function RiskSummary({ red, yellow }: { red: number; yellow: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {red > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
          {red} 红
        </span>
      )}
      {yellow > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
          {yellow} 黄
        </span>
      )}
      {red === 0 && yellow === 0 && (
        <span className="text-xs text-green-600 font-medium">无风险</span>
      )}
    </div>
  )
}
