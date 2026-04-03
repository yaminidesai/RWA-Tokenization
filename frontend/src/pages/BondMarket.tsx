import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { bondsApi, investorApi } from '../api/client'

export default function BondMarket() {
  const qc = useQueryClient()
  const { data: bonds = [], isLoading } = useQuery({
    queryKey: ['bonds'],
    queryFn: () => bondsApi.list().then((r) => r.data),
  })

  const [buyForm, setBuyForm] = useState<{ bondId: string; units: string; maxPrice: string; accountRef: string } | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const submit = useMutation({
    mutationFn: (b: { cusip: string; requestedUnits: number; maxPurchasePrice: number; investorAccountRef: string }) =>
      investorApi.submitPurchase(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      setBuyForm(null)
      setSuccess('Purchase request submitted. The bank will process it shortly.')
      setTimeout(() => setSuccess(''), 5000)
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Submission failed'),
  })

  function handleBuy(bond: any) {
    setBuyForm({ bondId: bond.id, units: '', maxPrice: (Number(bond.face_value) * 1.01).toFixed(2), accountRef: '' })
    setError('')
  }

  function handleSubmitBuy(bond: any) {
    if (!buyForm) return
    submit.mutate({
      cusip: bond.cusip,
      requestedUnits: Number(buyForm.units),
      maxPurchasePrice: Number(buyForm.maxPrice),
      investorAccountRef: buyForm.accountRef,
    })
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bond Market</h1>
        <p className="text-gray-500 text-sm">Purchase tokenized US Treasury securities</p>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading bonds…</div>
      ) : bonds.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">No bonds currently available.</div>
      ) : (
        <div className="space-y-4">
          {bonds.map((bond: any) => (
            <div key={bond.id} className="bg-white rounded-xl border p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-gray-900">{bond.cusip}</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{bond.treasury_type ?? bond.asset_class}</span>
                  </div>
                  <p className="text-sm text-gray-600">{bond.issuer_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{(Number(bond.coupon_rate) * 100).toFixed(3)}%</p>
                  <p className="text-xs text-gray-500">Annual coupon</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                <Info label="Face value" value={`$${Number(bond.face_value).toLocaleString()}`} />
                <Info label="Maturity" value={bond.maturity_date} />
                <Info label="Frequency" value={bond.coupon_freq} />
                <Info label="Available" value={`${Number(bond.available_units).toLocaleString()} units`} />
              </div>

              {buyForm?.bondId === bond.id ? (
                <div className="border-t pt-4 space-y-3">
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Units to buy</label>
                      <input
                        type="number" min="1" max={bond.available_units}
                        value={buyForm.units}
                        onChange={(e) => setBuyForm({ ...buyForm, units: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="e.g. 10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max price per unit ($)</label>
                      <input
                        type="number"
                        value={buyForm.maxPrice}
                        onChange={(e) => setBuyForm({ ...buyForm, maxPrice: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Bank account ref</label>
                      <input
                        type="text"
                        value={buyForm.accountRef}
                        onChange={(e) => setBuyForm({ ...buyForm, accountRef: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="e.g. ACCT-12345"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSubmitBuy(bond)}
                      disabled={submit.isPending || !buyForm.units || !buyForm.accountRef}
                      className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      {submit.isPending ? 'Submitting…' : 'Submit request'}
                    </button>
                    <button
                      onClick={() => setBuyForm(null)}
                      className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleBuy(bond)}
                  className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Buy
                </button>
              )}
            </div>
          ))}
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
