import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/navbar'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: '跃海运价助手',
  description: '跃海货代多格式运价/船期资料自动导入系统',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 text-gray-900 min-h-screen">
        <Navbar />
        <main className="max-w-[1400px] mx-auto px-6 py-6">
          {children}
        </main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
