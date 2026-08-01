'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Plug,
  Layers,
  AppWindow,
  Boxes,
  BarChart3,
  ScrollText,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/providers', label: 'Providers', icon: Plug },
  { href: '/aliases', label: 'Aliases', icon: Layers },
  { href: '/apps', label: 'Apps', icon: AppWindow },
  { href: '/projects', label: 'Projects', icon: Boxes },
  { href: '/usage', label: 'Usage', icon: BarChart3 },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function AdminShell({ title, children }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <div className="min-h-screen flex bg-surface-primary text-text-primary">
      <aside className="w-60 shrink-0 bg-surface-secondary border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="text-sm font-semibold tracking-tight">SDM LLM Gateway</div>
          <div className="text-xs text-muted mt-1">v{process.env.NEXT_PUBLIC_APP_VERSION}</div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-muted hover:text-text-primary hover:bg-surface-hover',
                )}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-border">
          <div className="text-xs text-muted mb-2 truncate">{session?.user?.email}</div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="px-8 py-6 border-b border-border">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </header>
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  )
}
