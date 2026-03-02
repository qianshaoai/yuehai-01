import Link from 'next/link'
import { FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <FileSearch className="w-12 h-12 text-gray-300" />
      <h2 className="text-lg font-semibold text-gray-700">页面不存在</h2>
      <p className="text-sm text-gray-400">您访问的页面或任务不存在，可能已被删除。</p>
      <Link href="/">
        <Button className="bg-[#2563EB] hover:bg-blue-700">返回任务列表</Button>
      </Link>
    </div>
  )
}
