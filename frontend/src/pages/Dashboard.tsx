import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { investorApi } from '../api/client'
import { useAuthStore } from '../store/auth.store'

const KYC_LABELS: Record<string, { label: string; color: string }> = {
  registered:       { label: 'Registered',        color: 'bg-gray-100 text-gray-600' },
  invited:          { label: 'Invitation sent',    color: 'bg-blue-100 text-blue-700' },
  accepted:         { label: 'Verifying identity', color: 'bg-yellow-100 text-yellow-700' },
  pending_approval: { label: 'Pending bank review',color: 'bg-orange-100 text-orange-700' },
  approved:         { label: 'KYC Approved',       color: 'bg-green-100 text-green-700' },
  rejected:         { label: 'KYC Rejected',       color: 'bg-red-100 text-red-700' },
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: kyc } = useQuery({ queryKey: ['kyc'], queryFn: () => investorApi.kyc().then((r) => r.data) })
  const { data: holdings = [] } = useQuery({ queryKey: ['holdings'], queryFn: () => investorApi.holdings().then((r) => r.data) })
  const { data: coupons = [] } = useQuery({ queryKey: ['coupons'], queryFn: () => investorApi.coupons().then((r) => r.data) })

  const kycInfo = KYC_LABELS[kyc?.status ?? 'registered']
  const totalValue = holdings.reduce((sum: number, h: any) => sum + Number(h.units) * Number(h.face_value), 0)
  const totalCoupons = coupons.reduce((sum: number, c: any) => sum + Number(c.amount), 0)

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm">{user?.email}</p>
      </div>

      {/* KYC Status Banner */}
      <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${
        kyc?.status === 'approved' ? 'bg-green-50 border-green-200' :
        kyc?.status === 'rejected' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
      }`}>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${kycInfo?.color}`}>
          {kycInfo?.label ?? 'Loading…'}
        </span>
        <span className="text-sm text-gray-600">
          {kyc?.status === 'approved'
            ? `Identity verified. KYC valid until ${kyc.expiry_date}.`
            : kyc?.status === 'rejected'
            ? `KYC rejected: ${kyc.rejection_reason}`
            : 'Your identity is being verified. You can browse bonds while we process your application.'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Portfolio Value" value={`$${totalValue.toLocaleString()}`} />
        <StatCard label="Active Holdings" value={String(holdings.length)} />
        <StatCard label="Total Coupons Received" value={`$${totalCoupons.toFixed(2)}`} />
      </div>

      {/* Recent Holdings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Your Holdings</h2>
          <Link to="/holdings" className="text-sm text-brand-600 hover:underline">View all</Link>
        </div>

        {holdings.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <p className="text-gray-500 mb-3">You don't hold any bonds yet.</p>
            <Link
              to="/market"
              className="inline-block bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
            >
              Browse Bond Market
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {holdings.slice(0, 3).map((h: any) => (
              <div key={h.id} className="bg-white rounded-xl border p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">{h.cusip}</p>
                  <p className="text-sm text-gray-500">{h.issuer_name} · {(Number(h.coupon_rate) * 100).toFixed(2)}% · Matures {h.maturity_date}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{Number(h.units).toLocaleString()} units</p>
                  <p className="text-sm text-gray-500">${(Number(h.units) * Number(h.face_value)).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
