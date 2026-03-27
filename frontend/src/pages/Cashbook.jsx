import { useEffect, useState } from 'react'
import { deleteCashTransaction, getCashbookSummary, getCashTransactions } from '../api/cashbook'
import { useAuth } from '../context/AuthContext'
import AddTransactionModal from '../components/AddTransactionModal'
import CashTransactionDetailPanel from '../components/CashTransactionDetailPanel'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function SummaryCard({ label, value, colorCls, sub }) {
  return (
    <div className={`card border-l-4 ${colorCls}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">₹{fmt(value)}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

const MODE_LABELS = { cash: 'Cash', online: 'Online / UPI' }

const CATEGORY_LABELS = {
  sale:             'Sale',
  payment_received: 'Payment Received',
  manual_in:        'Manual In',
  expense:          'Expense',
  manual_out:       'Manual Out',
  supplier_payment: 'Supplier Payment',
}

export default function Cashbook() {
  const { isManager } = useAuth()

  const [summary, setSummary]           = useState(null)
  const [transactions, setTransactions] = useState([])
  const [count, setCount]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  const [typeFilter, setTypeFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [showModal, setShowModal]   = useState(false)

  const [deletingId, setDeletingId]   = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [selectedTx, setSelectedTx]   = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { page_size: 100 }
      if (typeFilter) params.transaction_type = typeFilter
      if (modeFilter) params.mode = modeFilter

      const [sumRes, txRes] = await Promise.all([
        getCashbookSummary(),
        getCashTransactions(params),
      ])
      setSummary(sumRes.data.data)
      setTransactions(txRes.data.results || [])
      setCount(txRes.data.count || 0)
    } catch {
      setError('Failed to load cashbook data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [typeFilter, modeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return
    setDeletingId(id)
    setDeleteError(null)
    try {
      await deleteCashTransaction(id)
      load()
    } catch {
      setDeleteError('Failed to delete transaction.')
    } finally {
      setDeletingId(null)
    }
  }

  const today    = new Date().toISOString().slice(0, 10)
  const todayTxns = transactions.filter((t) => t.transaction_date === today)
  const todayIn   = todayTxns.filter((t) => t.transaction_type === 'IN').reduce((s, t) => s + Number(t.amount), 0)
  const todayOut  = todayTxns.filter((t) => t.transaction_type === 'OUT').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cashbook</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track all money in and out</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          + Add Transaction
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Balance"  value={summary?.balance}      colorCls="border-brand-500" />
        <SummaryCard label="Cash in Hand"   value={summary?.cash_in_hand} colorCls="border-blue-500" sub="Cash mode only" />
        <SummaryCard label="Today's In"     value={todayIn}               colorCls="border-green-500" />
        <SummaryCard label="Today's Out"    value={todayOut}              colorCls="border-red-500" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Types</option>
          <option value="IN">Money In</option>
          <option value="OUT">Money Out</option>
        </select>

        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Modes</option>
          <option value="cash">Cash</option>
          <option value="online">Online / UPI</option>
        </select>

        {(typeFilter || modeFilter) && (
          <button
            onClick={() => { setTypeFilter(''); setModeFilter('') }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-gray-500">
          {count} transaction{count !== 1 ? 's' : ''}
        </span>
      </div>

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {/* Transaction list */}
      {loading ? (
        <div className="card text-center py-12 text-gray-400">Loading…</div>
      ) : error ? (
        <div className="card text-center py-12 text-red-500">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg">No transactions yet</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
            Add first transaction
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Type', 'Category', 'Mode', 'Order', 'Description', 'Amount',
                  ...(isManager ? [''] : [])].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedTx(t)}>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    <p>{t.transaction_date}</p>
                    {t.created_at && (
                      <p className="text-gray-400">{new Date(t.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${t.transaction_type === 'IN'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-600'}`}>
                      {t.transaction_type === 'IN' ? '+ In' : '− Out'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {MODE_LABELS[t.mode] ?? t.mode}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {t.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {t.description || '—'}
                  </td>
                  <td className={`px-4 py-3 font-semibold whitespace-nowrap
                    ${t.transaction_type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.transaction_type === 'IN' ? '+' : '−'} ₹{fmt(t.amount)}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingId === t.id ? '…' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddTransactionModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}

      <CashTransactionDetailPanel
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  )
}
