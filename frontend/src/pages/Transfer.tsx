import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { investorApi } from '../api/client'

export default function Transfer() {
  const { holdingId } = useParams<{ holdingId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => investorApi.holdings().then((r) => r.data),
  })
  const holding = holdings.find((h: any) => h.id === holdingId)

  const [form, setForm] = useState({ toEmail: '', transferUnits: '', isSplit: false })
  const [error, setError] = useState('')

  const transfer = useMutation({
    mutationFn: () =>
      form.isSplit
        ? investorApi.splitTransfer(holdingId!, { toEmail: form.toEmail, transferUnits: Number(form.transferUnits) })
        : investorApi.transfer(holdingId!, { toEmail: form.toEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      navigate('/holdings')
    },
    onError: (err: any) => setError(err.response?.data?.error ?? 'Transfer failed'),
  })

  if (!holding) {
    return (
      <Layout>
        <div className="text-center py-12 text-gray-400">Holding not found.</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate('/holdings')} className="text-sm text-brand-600 hover:underline mb-4 block">
          ← Back to holdings
        </button>

        <div className="bg-white rounded-xl border p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Transfer Bond</h1>
          <p className="text-sm text-gray-500 mb-5">
            {holding.cusip} · {Number(holding.units).toLocaleString()} units · ${(Number(holding.units) * Number(holding.face_value)).toLocaleString()}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipient email</label>
              <input
                type="email" required
                value={form.toEmail}
                onChange={(e) => setForm({ ...form, toEmail: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="recipient@example.com"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isSplit}
                onChange={(e) => setForm({ ...form, isSplit: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Partial transfer (keep some units)</span>
            </label>

            {form.isSplit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Units to transfer (max {Number(holding.units) - 1})
                </label>
                <input
                  type="number" min="1" max={Number(holding.units) - 1}
                  value={form.transferUnits}
                  onChange={(e) => setForm({ ...form, transferUnits: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => transfer.mutate()}
                disabled={transfer.isPending || !form.toEmail || (form.isSplit && !form.transferUnits)}
                className="flex-1 bg-brand-600 text-white font-medium py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {transfer.isPending ? 'Transferring…' : 'Confirm transfer'}
              </button>
              <button
                onClick={() => navigate('/holdings')}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
