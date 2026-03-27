/**
 * Slide-in detail panel for a cash transaction.
 * Appears on the right side when user clicks a cashbook row.
 */
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MODE_LABELS = { cash: 'Cash', online: 'Online / UPI' }

const CATEGORY_LABELS = {
  sale:             'Sale',
  payment_received: 'Payment Received',
  manual_in:        'Manual In',
  expense:          'Expense',
  manual_out:       'Manual Out',
  supplier_payment: 'Supplier Payment',
}

export default function CashTransactionDetailPanel({ tx, onClose }) {
  if (!tx) return null

  const isIn = tx.transaction_type === 'IN'

  const fmtDateTime = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between border-b border-gray-200
          ${isIn ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm
              ${isIn ? 'bg-green-500' : 'bg-red-500'}`}>
              {isIn ? '+' : '−'}
            </div>
            <div>
              <p className={`font-bold text-lg ${isIn ? 'text-green-700' : 'text-red-700'}`}>
                {isIn ? '+' : '−'} ₹{fmt(tx.amount)}
              </p>
              <p className="text-xs text-gray-500">{CATEGORY_LABELS[tx.category] ?? tx.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <Row label="Type">
            <span className={`badge ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {isIn ? 'Money In' : 'Money Out'}
            </span>
          </Row>

          <Row label="Category">
            {CATEGORY_LABELS[tx.category] ?? tx.category}
          </Row>

          <Row label="Mode">
            {MODE_LABELS[tx.mode] ?? tx.mode}
          </Row>

          <Row label="Transaction Date">
            {tx.transaction_date}
          </Row>

          <Row label="Recorded At">
            {fmtDateTime(tx.created_at)}
          </Row>

          {tx.order_number && (
            <Row label="Order">
              <span className="font-mono text-brand-600">{tx.order_number}</span>
            </Row>
          )}

          {tx.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Description</p>
              <p className="bg-gray-50 rounded-lg px-3 py-2 text-gray-700">{tx.description}</p>
            </div>
          )}

          {tx.created_by_name && (
            <Row label="Recorded by">
              {tx.created_by_name}
            </Row>
          )}

          {tx.attachment && (
            <Row label="Attachment">
              <a href={tx.attachment} target="_blank" rel="noreferrer"
                className="text-brand-600 hover:underline text-xs">
                View attachment →
              </a>
            </Row>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 text-xs flex-shrink-0 w-28">{label}</span>
      <span className="text-gray-800 font-medium text-right">{children}</span>
    </div>
  )
}
