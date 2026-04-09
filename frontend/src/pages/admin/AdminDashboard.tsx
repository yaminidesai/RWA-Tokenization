/**
 * AdminDashboard — Bank Operations Center
 *
 * The primary workflow console for the bank's operations team. Every action
 * on this page maps to a DAML choice exercise on the Canton ledger:
 *
 * Pending Purchases (EscrowRequest → ApprovedPurchase → TokenizedBond):
 *   Approve → POST /api/admin/purchases/:id/approve
 *     → purchaseService.approvePurchaseRequest()
 *     → ledger.exercise(EscrowRequest, ApproveRequest)  [creates ApprovedPurchase]
 *     → purchaseService.executeDTCPurchaseAndMint() runs async:
 *         ledger.submitBatch([ConfirmCustodyAndMint, RecordMinting, create TokenizedBond])
 *   Reject  → POST /api/admin/purchases/:id/reject  (reason required)
 *     → ledger.exercise(EscrowRequest, RejectRequest)  [creates RejectedRequest]
 *
 * Pending Redemptions (RedemptionRequest → BurnToken + RecordRedemption):
 *   Approve & Pay → POST /api/admin/redemptions/:id/approve  (accountRef required)
 *     → redemptionService.approveRedemption()
 *     → ledger.exercise(RedemptionRequest, ApproveRedemption)
 *     → ledger.exercise(TokenizedBond, BurnToken)
 *     → ledger.exercise(CustodyRecord, RecordRedemption)  [all three atomic]
 *
 * Coupon Distribution (creates CouponPaymentRecord per holder):
 *   → POST /api/admin/coupons/distribute
 *     → couponService.distributeCoupon(cusip, couponDate, rate)
 *     → for each holder: ledger.exercise(TokenizedBond, RecordCouponPayment) [nonconsuming]
 *     Bank triggers this after receiving DTC MT564 corporate action notification
 *     confirming coupon proceeds have been received from the US Treasury.
 *
 * Stats panel pulls from PostgreSQL (not Canton) for performance — the ledger
 * event stream keeps the DB in sync with on-ledger contract state.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { adminApi } from '../../api/client'
import { useState } from 'react'

export default function AdminDashboard() {
  const qc = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: () => adminApi.stats().then((r) => r.data) })
  const { data: pendingPurchases = [] } = useQuery({ queryKey: ['admin-purchases'], queryFn: () => adminApi.pendingPurchases().then((r) => r.data) })
  const { data: pendingRedemptions = [] } = useQuery({ queryKey: ['admin-redemptions'], queryFn: () => adminApi.pendingRedemptions().then((r) => r.data) })

  const [rejectForm, setRejectForm] = useState<{ type: 'purchase' | 'redemption'; id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [redemptionAccountRef, setRedemptionAccountRef] = useState('')
  const [msg, setMsg] = useState('')
  const [couponForm, setCouponForm] = useState({ cusip: '', couponDate: '', annualCouponRate: '' })

  const approvePurchase = useMutation({
    mutationFn: (id: string) => adminApi.approvePurchase(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-purchases'] }); setMsg('Purchase approved — DTC settlement in progress') },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  const rejectPurchase = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.rejectPurchase(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-purchases'] }); setRejectForm(null); setMsg('Purchase rejected') },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  const approveRedemption = useMutation({
    mutationFn: ({ id, accountRef }: { id: string; accountRef: string }) => adminApi.approveRedemption(id, accountRef),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-redemptions'] }); setMsg('Redemption approved and payment sent') },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  const distributeCoupon = useMutation({
    mutationFn: () => adminApi.distributeCoupon({ cusip: couponForm.cusip, couponDate: couponForm.couponDate, annualCouponRate: Number(couponForm.annualCouponRate) }),
    onSuccess: (res: any) => { setMsg(`Coupon distributed to ${res.data.distributed} holder(s)`); setCouponForm({ cusip: '', couponDate: '', annualCouponRate: '' }) },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{msg}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Investors" value={stats?.totalInvestors ?? '—'} />
        <StatCard label="Pending KYC" value={stats?.pendingKYC ?? '—'} accent={stats?.pendingKYC > 0} />
        <StatCard label="Active Bonds" value={stats?.activeBonds ?? '—'} />
        <StatCard label="Active Holdings" value={stats?.activeHoldings ?? '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Purchases */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Pending Purchases</h2>
            {stats?.pendingKYC > 0 && (
              <Link to="/admin/kyc" className="text-sm text-brand-600 hover:underline">{stats.pendingKYC} KYC pending →</Link>
            )}
          </div>
          {pendingPurchases.length === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-sm text-gray-500 text-center">No pending purchases</div>
          ) : (
            <div className="space-y-3">
              {pendingPurchases.map((p: any) => (
                <div key={p.id} className="bg-white rounded-xl border p-4">
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="font-semibold">{p.full_name}</p>
                      <p className="text-xs text-gray-500">{p.email} · {p.cusip}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{Number(p.requested_units).toLocaleString()} units</p>
                      <p className="text-xs text-gray-500">Max ${Number(p.max_purchase_price).toFixed(2)}/unit</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePurchase.mutate(p.id)}
                      disabled={approvePurchase.isPending}
                      className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectForm({ type: 'purchase', id: p.id }); setRejectReason('') }}
                      className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Redemptions */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Pending Redemptions</h2>
          {pendingRedemptions.length === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-sm text-gray-500 text-center">No pending redemptions</div>
          ) : (
            <div className="space-y-3">
              {pendingRedemptions.map((r: any) => (
                <div key={r.id} className="bg-white rounded-xl border p-4">
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-xs text-gray-500">{r.email} · {r.cusip}</p>
                    </div>
                    <p className="font-semibold">{Number(r.units).toLocaleString()} units</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Bank account ref (e.g. ACCT-12345)"
                      value={redemptionAccountRef}
                      onChange={(e) => setRedemptionAccountRef(e.target.value)}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      onClick={() => approveRedemption.mutate({ id: r.id, accountRef: redemptionAccountRef })}
                      disabled={approveRedemption.isPending || !redemptionAccountRef.trim()}
                      className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {approveRedemption.isPending ? 'Processing…' : 'Approve & Pay'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Coupon Distribution */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Distribute Coupon Payment</h2>
        <div className="bg-white rounded-xl border p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CUSIP</label>
              <input
                type="text" placeholder="e.g. 912828ZT5"
                value={couponForm.cusip}
                onChange={(e) => setCouponForm({ ...couponForm, cusip: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Coupon date</label>
              <input
                type="date"
                value={couponForm.couponDate}
                onChange={(e) => setCouponForm({ ...couponForm, couponDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Annual coupon rate (e.g. 0.04375)</label>
              <input
                type="number" step="0.001" placeholder="0.04375"
                value={couponForm.annualCouponRate}
                onChange={(e) => setCouponForm({ ...couponForm, annualCouponRate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <button
            onClick={() => distributeCoupon.mutate()}
            disabled={distributeCoupon.isPending || !couponForm.cusip || !couponForm.couponDate || !couponForm.annualCouponRate}
            className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {distributeCoupon.isPending ? 'Distributing…' : 'Distribute coupon'}
          </button>
        </div>
      </section>

      {/* Reject modal */}
      {rejectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-3">Reject request</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm mb-3 h-24"
              placeholder="Reason for rejection…"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!rejectForm) return
                  rejectPurchase.mutate({ id: rejectForm.id, reason: rejectReason })
                }}
                disabled={!rejectReason || rejectPurchase.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {rejectPurchase.isPending ? 'Rejecting…' : 'Confirm reject'}
              </button>
              <button onClick={() => setRejectForm(null)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function StatCard({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-orange-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
