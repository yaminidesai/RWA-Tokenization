import { create } from 'zustand'

interface User {
  id: string
  email: string
  role: 'investor' | 'admin'
  investorId?: string
}

interface AuthStore {
  user: User | null
  login: (user: User) => void
  logout: () => void
}

// Token is stored in an httpOnly cookie set by the server — never readable by JS.
// Only non-sensitive user profile info is kept in sessionStorage for UI display.
export const useAuthStore = create<AuthStore>((set) => ({
  user: (() => {
    try { return JSON.parse(sessionStorage.getItem('user') ?? 'null') } catch { return null }
  })(),

  login: (user) => {
    sessionStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  logout: () => {
    sessionStorage.removeItem('user')
    set({ user: null })
  },
}))
