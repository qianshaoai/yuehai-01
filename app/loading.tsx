import { Loader2 } from 'lucide-react'

export default function GlobalLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] gap-2 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">加载中...</span>
    </div>
  )
}
