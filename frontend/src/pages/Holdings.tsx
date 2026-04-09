/**
 * Holdings — Investor's Active TokenizedBond Positions
 *
 * Shows all TokenizedBond contracts where the investor is the currentOwner,
 * along with their coupon payment history and the redemption workflow.
 *
 * The Redeem button triggers:
 *   POST /api/investor/holdings/:id/redeem
 *   → redemptionService.initiateRedemption()
 *   → ledger.exercise(TokenizedBond, InitiateRedemption)
 *   → creates RedemptionRequest on Canton (co-signed by bank + investor)
 *
 * Two-step confirmation UX (Redeem → Confirm) is intentional: once the bank
 * approves, redemption is irreversible. InitiateRedemption is nonconsuming —
 * the TokenizedBond stays live until the bank exercises BurnToken atomically
 * with ApproveRedemption + CustodyRecord.RecordRedemption. The investor cannot
 * cancel after initiation; only the bank can reject (e.g. bond not yet matured).
 *
 * Transfer navigation links to /transfer/:holdingId (Transfer.tsx) where the
 * investor can exercise TransferOwnership or SplitTransfer on Canton.
 *
 * Data: GET /api/investor/holdings  → TokenizedBond projections per investor
 *       GET /api/investor/coupons   → CouponPaymentRecord projections per investor
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Layout from '../components/Layout'
import { investorApi } from '../api/client'

export default function Holdings() {
  const qc = useQueryClient()
  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => investorApi.holdings().then((r) => r.data),
  })
  const { data: coupons = [] } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => investorApi.coupons().then((r) => r.data),
  })

  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const redeem = useMutation({
    mutationFn: (id: string) => investorApi.redeem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      setRedeemingId(null)
      setMsg('Redemption request submitted. The bank will process it shortly.')
      setTimeout(() => setMsg(''), 5000)
    },
    onError: (err: any) => setMsg(err.response?.data?.error ?? 'Error'),
  })

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Holdings</h1>
        <p className="text-gray-500 text-sm">Your tokenized Treasury bond positions</p>
      </div>

      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{msg}</div>}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : holdings.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">No active holdings.</div>
      ) : (
        <div className="space-y-4">
          {holdings.map((h: any) => {
            const holdingCoupons = coupons.filter((c: any) => c.holding_id === h.id)
            return (
              <div key={h.id} className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-lg">{h.cusip}</p>
                    <p className="text-sm text-gray-500">{h.issuer_name} · {(Number(h.coupon_rate) * 100).toFixed(3)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{Number(h.units).toLocaleString()} units</p>
                    <p className="text-sm text-gray-500">${(Number(h.units) * Number(h.face_value)).toLocaleString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                  <Info label="Minted" value={h.mint_date} />
                  <Info label="Matures" value={h.maturity_date} />
                  <Info label="Coupons received" value={`$${holdingCoupons.reduce((s: number, c: any) => s + Number(c.amount), 0).toFixed(2)}`} />
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/transfer/${h.id}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-brand-500 text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    Transfer
                  </a>
                  {redeemingId === h.id ? (
                    <div className="flex gap-2 items-center">
                      <span className="text-sm text-gray-600">Confirm redemption?</span>
                      <button
                        onClick={() => redeem.mutate(h.id)}
                        disabled={redeem.isPending}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                      <button onClick={() => setRedeemingId(null)} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRedeemingId(h.id)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Redeem
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  )
}
