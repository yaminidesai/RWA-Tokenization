import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { authApi } from '../api/client'
import { useQueryClient } from '@tanstack/react-query'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const nav = [
    { path: '/',         label: 'Dashboard' },
    { path: '/market',   label: 'Bond Market' },
    { path: '/holdings', label: 'My Holdings' },
  ]

  async function handleLogout() {
    await authApi.logout().catch(() => {}) // clear httpOnly cookie server-side
    qc.clear()                             // wipe cached data
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="font-bold text-lg tracking-tight">RWA Treasury Bonds</span>
            <nav className="hidden md:flex gap-1">
              {nav.map((n) => (
                <Link
                  key={n.path}
                  to={n.path}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    location.pathname === n.path
                      ? 'bg-white/20 text-white'
                      : 'text-blue-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-200">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 rounded border border-blue-400 hover:bg-white/10 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">{children}</main>

      <footer className="border-t bg-white text-center py-4 text-xs text-gray-400">
        RWA Treasury Bond Tokenization Platform — Demo Build
      </footer>
    </div>
  )
}
