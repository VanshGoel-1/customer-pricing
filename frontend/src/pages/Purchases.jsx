import { useEffect, useState } from 'react'
import { getPurchases } from '../api/suppliers'
import { useAuth } from '../context/AuthContext'
import AddPurchaseInvoiceModal from '../components/AddPurchaseInvoiceModal'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_COLOR = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-green-100 text-green-700',
}

const DEAL_COLOR = {
  good: 'bg-green-100 text-green-700',
  okay: 'bg-amber-100 text-amber-700',
  bad:  'bg-red-100 text-red-600',
}

export default function Purchases() {
  const { isManager } = useAuth()
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await getPurchases({ page_size: 100, search })
      setPurchases(data.results || data || [])
    } catch {
      setError('Failed to load purchases.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchases</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track and evaluate all inventory purchases</p>
        </div>
        {isManager && (
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            + New Purchase
          </button>
        )}
      </div>

      {/* Search & Stats */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoice # or supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>
        <span className="text-sm text-gray-500">{purchases.length} invoices found</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card text-center py-12 text-gray-400">Loading…</div>
      ) : error ? (
        <div className="card text-center py-12 text-red-500">{error}</div>
      ) : purchases.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-lg">No purchases found.</p>
          {isManager && !search && (
            <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">Record first purchase</button>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Invoice #', 'Date', 'Supplier', 'Total', 'Status', 'Deal'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-brand-600">{p.invoice_number || `#${p.id}`}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(p.invoice_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.supplier_name}</td>
                  <td className="px-4 py-3 font-semibold">₹{fmt(p.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status_display || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.deal_label ? (
                      <span className={`badge ${DEAL_COLOR[p.deal_label] || 'bg-gray-100 text-gray-600'}`}>
                        {p.deal_label.charAt(0).toUpperCase() + p.deal_label.slice(1)} Deal
                      </span>
                    ) : (
                      <span className="text-gray-300">Not rated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddPurchaseInvoiceModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false)
            load()
          }}
        />
      )}
    </div>
  )
}
