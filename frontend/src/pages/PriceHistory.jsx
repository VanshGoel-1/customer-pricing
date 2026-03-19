import { useEffect, useState } from 'react'
import { getCustomers } from '../api/customers'
import { getPriceHistory } from '../api/pricing'

export default function PriceHistory() {
  const [history, setHistory] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ customer: '', product: '' })

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter.customer) params.customer = filter.customer
      const { data } = await getPriceHistory(params)
      setHistory(data.results || data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getCustomers({ page_size: 200 }).then(({ data }) => setCustomers(data.results || []))
  }, [])

  useEffect(() => { load() }, [filter.customer])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Price History</h2>
      <p className="text-sm text-gray-500">Immutable audit log of every price change — who changed what, when.</p>

      <div className="flex gap-4">
        <select className="input w-56" value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <p className="text-gray-400">Loading…</p> : history.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">No price history yet.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {['Customer', 'Product', 'v#', 'Old Price', 'New Price', 'Changed By', 'Notes', 'Date'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{h.customer_name}</td>
                  <td className="px-4 py-3">
                    <p>{h.product_name}</p>
                    <p className="text-xs text-gray-400">{h.product_sku}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="badge bg-brand-100 text-brand-700">v{h.version}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 line-through">{Number(h.old_price).toFixed(2)}</td>
                  <td className="px-4 py-3 font-semibold text-brand-600">{Number(h.new_price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{h.changed_by_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{h.notes || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(h.changed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
