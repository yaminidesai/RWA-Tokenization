/**
 * KYCApproval — Bank Compliance Officer's Identity Verification Review
 *
 * This page is the human-in-the-loop control point between automated
 * identity verification (Jumio + OFAC screening) and on-ledger KYC approval.
 * In a production system, this would be the compliance officer's workstation.
 *
 * The workflow:
 *   1. Automated verification runs after investor registration (KYC Service)
 *   2. If Jumio + OFAC pass, the investor appears here with status 'pending_approval'
 *   3. Compliance officer reviews the Jumio reference (links to primary evidence)
 *      and OFAC reference, then approves or rejects
 *
 * On "Approve":
 *   POST /api/admin/kyc/:investorId/approve
 *   → kycService.approveKYC()
 *   → ledger.exercise(InvestorKYC, ApproveKYC, bank)  [asserts status == KYCPending]
 *   → DAML creates new InvestorKYC with status = KYCApproved
 *   The investor can now purchase bonds and receive transfers.
 *
 * On "Reject":
 *   POST /api/admin/kyc/:investorId/reject  (reason required)
 *   → kycService.rejectKYC()
 *   The rejection reason is stored in PostgreSQL and surfaced to the investor
 *   on their Dashboard. Adverse action notification is the bank's compliance obligation.
 *
 * Displayed fields: Jumio reference (links to off-chain ID check), OFAC reference
 * (links to sanctions screening record), expiry date (annual renewal requirement).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AdminLayout from '../../components/AdminLayout'
import { adminApi } from '../../api/client'
import { useState } from 'react'

export default function KYCApproval() {
  const qc = useQueryClient()
  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['kyc-pending'],
    queryFn: () => adminApi.pendingKyc().then((r) => r.data),
  })

  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [msg, setMsg] = useState('')

  const approve = useMutation({
    mutationFn: (investorId: string) => adminApi.approveKyc(investorId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kyc-pending'] }); setMsg('KYC approved.') },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  const reject = useMutation({
    mutationFn: ({ investorId, reason }: { investorId: string; reason: string }) =>
      adminApi.rejectKyc(investorId, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kyc-pending'] }); setRejectId(null); setMsg('KYC rejected.') },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">KYC Approvals</h1>
      <p className="text-sm text-gray-500 mb-6">Review identity verification results and approve or reject investors.</p>

      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{msg}</div>}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">No pending KYC applications.</div>
      ) : (
        <div className="space-y-4">
          {pending.map((inv: any) => (
            <div key={inv.investor_id} className="bg-white rounded-xl border p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-bold text-gray-900 text-lg">{inv.full_name}</p>
                  <p className="text-sm text-gray-500">{inv.email} · {inv.jurisdiction} · {inv.accreditation_level}</p>
                </div>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Pending review</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                <Info label="Jumio reference" value={inv.jumio_reference ?? '—'} />
                <Info label="OFAC reference"  value={inv.ofac_reference ?? '—'} />
                <Info label="KYC expires"     value={inv.expiry_date ?? '—'} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approve.mutate(inv.investor_id)}
                  disabled={approve.isPending}
                  className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => { setRejectId(inv.investor_id); setRejectReason('') }}
                  className="text-sm px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-3">Reject KYC</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm mb-3 h-24"
              placeholder="Reason for rejection…"
            />
            <div className="flex gap-2">
              <button
                onClick={() => reject.mutate({ investorId: rejectId, reason: rejectReason })}
                disabled={!rejectReason || reject.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button onClick={() => setRejectId(null)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800 text-xs">{value}</p>
    </div>
  )
}
