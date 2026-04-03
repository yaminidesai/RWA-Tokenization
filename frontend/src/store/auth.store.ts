import { create } from 'zustand'

interface User {
  id: string
  email: string
  role: 'investor' | 'admin'
  investorId?: string
}

interface AuthStore {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: (() => {
    try { return JSON.parse(localStorage.getItem('user') ?? 'null') } catch { return null }
  })(),
  token: localStorage.getItem('token'),

  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
  },
}))
