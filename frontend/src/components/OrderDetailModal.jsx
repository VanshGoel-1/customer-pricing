import { useEffect, useState } from 'react'
import { getOrder } from '../api/orders'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

export default function OrderDetailModal({ orderId, onClose }) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getOrder(orderId)
      .then(({ data }) => setOrder(data.data ?? data))
      .catch(() => setError('Failed to load order details.'))
      .finally(() => setLoading(false))
  }, [orderId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {order ? order.order_number : 'Order Details'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading && <p className="text-gray-400 text-center py-8">Loading…</p>}
          {error && <p className="text-red-500 text-center py-8">{error}</p>}

          {order && <>
            {/* Meta row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400">Customer</p>
                  <p className="font-semibold">{order.customer_name}</p>
                  <p className="text-gray-500">{order.customer_phone}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Date</p>
                  <p>{new Date(order.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}</p>
                </div>
                {order.confirmed_at && (
                  <div>
                    <p className="text-xs text-gray-400">Confirmed at</p>
                    <p>{new Date(order.confirmed_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Status</p>
                  <span className={`badge ${statusColor[order.status] || 'bg-gray-100 text-gray-600'}`}>
                    {order.status_display}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Payment Mode</p>
                  <span className={`badge ${modeColor[order.payment_mode] || 'bg-gray-100 text-gray-600'}`}>
                    {order.payment_mode_display}
                  </span>
                </div>
                {order.confirmed_by_name && (
                  <div>
                    <p className="text-xs text-gray-400">Confirmed by</p>
                    <p>{order.confirmed_by_name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items table */}
            {order.items?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Product', 'SKU', 'Qty', 'Unit Price', 'Total'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {order.items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            {item.product_name}
                            {item.is_price_overridden && (
                              <span className="ml-1 text-xs text-amber-500">(overridden)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 font-mono text-xs">{item.product_sku}</td>
                          <td className="px-3 py-2">{item.quantity} {item.unit}</td>
                          <td className="px-3 py-2">₹{fmt(item.unit_price)}</td>
                          <td className="px-3 py-2 font-semibold">₹{fmt(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Financial summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Amount</span>
                <span className="font-semibold">₹{fmt(order.total_amount)}</span>
              </div>
              {Number(order.total_paid) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span className="font-semibold">₹{fmt(order.total_paid)}</span>
                </div>
              )}
              {Number(order.remaining_balance) > 0 && (
                <div className="flex justify-between text-red-600 border-t border-gray-200 pt-2 mt-2">
                  <span className="font-semibold">Remaining</span>
                  <span className="font-bold">₹{fmt(order.remaining_balance)}</span>
                </div>
              )}
              {Number(order.remaining_balance) === 0 && order.status === 'paid' && (
                <div className="flex justify-between text-green-600 border-t border-gray-200 pt-2 mt-2">
                  <span className="font-semibold">Fully Paid</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Notes */}
            {order.notes && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{order.notes}</p>
              </div>
            )}
          </>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  )
}
