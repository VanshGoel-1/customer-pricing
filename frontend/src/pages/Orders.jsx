import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelOrder, getOrders, markPaid, recordPayment } from '../api/orders'
import { useAuth } from '../context/AuthContext'
import OrderDetailModal from '../components/OrderDetailModal'

const statusColor = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const modeColor = {
  cash:   'bg-green-100 text-green-700',
  online: 'bg-blue-100 text-blue-700',
  credit: 'bg-amber-100 text-amber-700',
}

const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function Orders() {
  const { isManager } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [actionError, setActionError] = useState('')

  // Payment input state: { [orderId]: { amount, mode } }
  const [paymentInputs, setPaymentInputs] = useState({})
  const [payingId, setPayingId]           = useState(null)

  // Detail modal
  const [detailOrderId, setDetailOrderId] = useState(null)

  const load = async () => {
    setLoading(true)
    setActionError('')
    try {
      const params = { page_size: 100 }
      if (statusFilter) params.status = statusFilter
      const { data } = await getOrders(params)
      setOrders(data.results || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkPaid = async (id, e) => {
    e.stopPropagation()
    setActionError('')
    try { await markPaid(id); load() }
    catch (err) { setActionError(err.response?.data?.error?.message || 'Action failed.') }
  }

  const handleCancel = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Cancel this order?')) return
    setActionError('')
    try { await cancelOrder(id); load() }
    catch (err) { setActionError(err.response?.data?.error?.message || 'Action failed.') }
  }

  const handleRecordPayment = async (order, e) => {
    e.stopPropagation()
    const input  = paymentInputs[order.id] || {}
    const amount = parseFloat(input.amount || 0)
    const mode   = input.mode || 'cash'
    if (!amount || amount <= 0) return
    setPayingId(order.id)
    setActionError('')
    try {
      await recordPayment(order.id, amount, mode)
      setPaymentInputs((prev) => ({ ...prev, [order.id]: {} }))
      load()
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Payment failed.')
    } finally {
      setPayingId(null)
    }
  }

  const setPaymentField = (orderId, field, value) => {
    setPaymentInputs((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [field]: value },
    }))
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Orders</h2>
        <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">No orders found.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Order #', 'Customer', 'Mode', 'Total', 'Paid', 'Remaining', 'Status', 'Date',
                  isManager ? 'Actions' : ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => {
                const remaining = Number(o.remaining_balance ?? (o.total_amount - (o.total_paid || 0)))
                const totalPaid = Number(o.total_paid || 0)
                const input = paymentInputs[o.id] || {}
                return (
                  <tr
                    key={o.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setDetailOrderId(o.id)}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-brand-600">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <p>{o.customer_name}</p>
                      <p className="text-xs text-gray-400">{o.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${modeColor[o.payment_mode] || 'bg-gray-100 text-gray-600'}`}>
                        {o.payment_mode_display || o.payment_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {Number(o.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-green-600 font-medium">
                      {totalPaid > 0
                        ? totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {remaining > 0
                        ? <span className="text-red-600 font-semibold">{remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        : <span className="text-green-600 text-xs font-medium">Fully paid</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${statusColor[o.status]}`}>{o.status_display}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                    {isManager && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-2">
                          {o.status === 'confirmed' && remaining > 0 && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min="0.01" step="0.01" max={remaining}
                                placeholder={`Max ${remaining.toFixed(2)}`}
                                className="input w-24 text-right py-1 text-xs"
                                value={input.amount || ''}
                                onChange={(e) => setPaymentField(o.id, 'amount', e.target.value)}
                              />
                              <select
                                className="input py-1 text-xs w-20"
                                value={input.mode || 'cash'}
                                onChange={(e) => setPaymentField(o.id, 'mode', e.target.value)}
                              >
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                              </select>
                              <button
                                onClick={(e) => handleRecordPayment(o, e)}
                                disabled={payingId === o.id}
                                className="text-xs btn-primary py-1 px-2 whitespace-nowrap"
                              >
                                {payingId === o.id ? '…' : 'Pay'}
                              </button>
                            </div>
                          )}
                          {o.status === 'confirmed' && remaining > 0 && (
                            <button
                              onClick={(e) => handleMarkPaid(o.id, e)}
                              className="text-xs text-brand-600 hover:underline text-left"
                            >
                              Mark fully paid
                            </button>
                          )}
                          {o.status === 'draft' && (
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/bill?draft=${o.id}`) }}
                                className="text-xs text-brand-600 hover:underline font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => handleCancel(o.id, e)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
        />
      )}
    </div>
  )
}
