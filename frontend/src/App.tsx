import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import BondMarket from './pages/BondMarket'
import Holdings from './pages/Holdings'
import Transfer from './pages/Transfer'
import AdminDashboard from './pages/admin/AdminDashboard'
import KYCApproval from './pages/admin/KYCApproval'
import CustodyManager from './pages/admin/CustodyManager'

function RequireAuth({ children, role }: { children: React.ReactElement; role?: string }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const user = useAuthStore((s) => s.user)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />

        {/* Investor routes */}
        <Route path="/" element={<RequireAuth role="investor"><Dashboard /></RequireAuth>} />
        <Route path="/market"   element={<RequireAuth role="investor"><BondMarket /></RequireAuth>} />
        <Route path="/holdings" element={<RequireAuth role="investor"><Holdings /></RequireAuth>} />
        <Route path="/transfer/:holdingId" element={<RequireAuth role="investor"><Transfer /></RequireAuth>} />

        {/* Admin routes */}
        <Route path="/admin"         element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />
        <Route path="/admin/kyc"     element={<RequireAuth role="admin"><KYCApproval /></RequireAuth>} />
        <Route path="/admin/bonds"   element={<RequireAuth role="admin"><CustodyManager /></RequireAuth>} />

        <Route path="*" element={<Navigate to={user?.role === 'admin' ? '/admin' : '/'} />} />
      </Routes>
    </BrowserRouter>
  )
}
