'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <AlertTriangle className="w-12 h-12 text-red-400" />
      <h2 className="text-lg font-semibold text-gray-800">页面发生错误</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        {error.message || '发生了未知错误，请尝试刷新页面。'}
      </p>
      <Button onClick={reset} className="bg-[#2563EB] hover:bg-blue-700">
        重新加载
      </Button>
    </div>
  )
}
