'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ship, ListTodo, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: '任务列表', icon: ListTodo },
  { href: '/templates', label: '模板管理', icon: LayoutTemplate },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-[#2563EB] font-semibold text-lg shrink-0">
          <Ship className="w-5 h-5" />
          <span>跃海运价助手</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-blue-50 text-[#2563EB]'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
