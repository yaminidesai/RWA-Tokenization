import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const nav = [
    { path: '/admin',       label: 'Dashboard' },
    { path: '/admin/kyc',   label: 'KYC Approvals' },
    { path: '/admin/bonds', label: 'Bond Inventory' },
  ]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="font-bold text-lg">RWA Admin</span>
            <nav className="hidden md:flex gap-1">
              {nav.map((n) => (
                <Link
                  key={n.path}
                  to={n.path}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    location.pathname === n.path
                      ? 'bg-white/20 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded border border-gray-500 hover:bg-white/10 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  )
}
