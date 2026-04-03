import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { adminApi } from '../../api/client'

const EMPTY_FORM = {
  cusip: '', isin: '', issuerName: 'US Department of the Treasury',
  assetClass: 'USTreasury', treasuryType: 'TNote',
  faceValue: '1000', couponRate: '', couponFreq: 'Semiannual',
  maturityDate: '', issuanceDate: '', regExemption: 'NoExemption',
  quantity: '', purchasePriceTotal: '', dtcSettlementRef: '', dealerReference: '',
}

export default function CustodyManager() {
  const qc = useQueryClient()
  const { data: bonds = [], isLoading } = useQuery({
    queryKey: ['admin-bonds'],
    queryFn: () => adminApi.bonds().then((r) => r.data),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [msg, setMsg] = useState('')

  const createBond = useMutation({
    mutationFn: () => adminApi.createBond({ ...form, faceValue: Number(form.faceValue), couponRate: Number(form.couponRate), quantity: Number(form.quantity), purchasePriceTotal: Number(form.purchasePriceTotal) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bonds'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setMsg('Bond added to inventory.')
    },
    onError: (e: any) => setMsg(e.response?.data?.error ?? 'Error'),
  })

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bond Inventory</h1>
          <p className="text-sm text-gray-500">Custody records for DTC-held Treasury securities</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add bond'}
        </button>
      </div>

      {msg && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{msg}</div>}

      {/* Add Bond Form */}
      {showForm && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-semibold mb-4">New Custody Record</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ['cusip', 'CUSIP', 'text', '912828YV6'],
              ['isin', 'ISIN', 'text', 'US912828YV65'],
              ['couponRate', 'Coupon rate (e.g. 0.045)', 'number', '0.045'],
              ['faceValue', 'Face value per unit ($)', 'number', '1000'],
              ['maturityDate', 'Maturity date', 'date', ''],
              ['issuanceDate', 'Issuance date', 'date', ''],
              ['quantity', 'Units purchased', 'number', ''],
              ['purchasePriceTotal', 'Total purchase cost ($)', 'number', ''],
              ['dtcSettlementRef', 'DTC settlement ref (MT545)', 'text', ''],
              ['dealerReference', 'Dealer trade reference', 'text', ''],
            ] as [keyof typeof form, string, string, string][]).map(([key, label, type, placeholder]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input type={type} value={form[key]} onChange={f(key)} placeholder={placeholder}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Treasury type</label>
              <select value={form.treasuryType} onChange={f('treasuryType')} className="w-full border rounded-lg px-3 py-2 text-sm">
                {['TBill', 'TNote', 'TBond', 'TIPS', 'FRN'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Coupon frequency</label>
              <select value={form.couponFreq} onChange={f('couponFreq')} className="w-full border rounded-lg px-3 py-2 text-sm">
                {['Semiannual', 'Quarterly', 'Annual', 'Monthly', 'ZeroCoupon'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={() => createBond.mutate()}
            disabled={createBond.isPending || !form.cusip || !form.quantity}
            className="mt-4 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {createBond.isPending ? 'Saving…' : 'Save bond'}
          </button>
        </div>
      )}

      {/* Bond List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : bonds.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">No bonds in inventory.</div>
      ) : (
        <div className="space-y-3">
          {bonds.map((bond: any) => (
            <div key={bond.id} className="bg-white rounded-xl border p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold">{bond.cusip} <span className="text-xs font-normal text-gray-400">{bond.treasury_type}</span></p>
                  <p className="text-sm text-gray-500">{(Number(bond.coupon_rate) * 100).toFixed(3)}% · Matures {bond.maturity_date}</p>
                </div>
                <div className="text-right text-sm">
                  <p><span className="text-gray-400">Total:</span> {Number(bond.quantity).toLocaleString()}</p>
                  <p><span className="text-gray-400">Minted:</span> {Number(bond.total_minted_units).toLocaleString()}</p>
                  <p className="font-semibold text-green-700"><span className="font-normal text-gray-400">Available:</span> {Number(bond.available_units).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
