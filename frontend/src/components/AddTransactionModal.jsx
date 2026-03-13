import { useRef, useState } from 'react'
import { createCashInTransaction, createCashOutTransaction } from '../api/cashbook'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

const IN_CATEGORIES  = [
  { value: 'sale',             label: 'Sale' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'manual_in',        label: 'Manual In' },
]

const OUT_CATEGORIES = [
  { value: 'expense',    label: 'Expense' },
  { value: 'manual_out', label: 'Manual Out' },
]

export default function AddTransactionModal({ onClose, onSaved }) {
  const [type, setType]     = useState('IN')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const fileRef = useRef(null)

  const [form, setForm] = useState({
    amount:           '',
    category:         '',
    mode:             'cash',
    description:      '',
    transaction_date: new Date().toISOString().slice(0, 10),
    attachment:       null,
  })

  // Reset category when type changes
  const handleTypeChange = (t) => {
    setType(t)
    setForm((f) => ({ ...f, category: '' }))
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.category) { setError('Please select a category.'); return }

    setLoading(true)
    try {
      const payload = new FormData()
      payload.append('amount',           form.amount)
      payload.append('category',         form.category)
      payload.append('mode',             form.mode)
      payload.append('description',      form.description)
      payload.append('transaction_date', form.transaction_date)
      if (form.attachment) payload.append('attachment', form.attachment)

      const createFn = type === 'IN' ? createCashInTransaction : createCashOutTransaction
      await createFn(payload)
      onSaved()
      onClose()
    } catch (err) {
      const detail = err.response?.data
      if (typeof detail === 'object') {
        const msgs = Object.values(detail).flat().join(' ')
        setError(msgs)
      } else {
        setError('Failed to save transaction.')
      }
    } finally {
      setLoading(false)
    }
  }

  const currentCategories = type === 'IN' ? IN_CATEGORIES : OUT_CATEGORIES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* IN / OUT toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {['IN', 'OUT'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`flex-1 py-2 text-sm font-semibold transition-colors
                  ${type === t
                    ? t === 'IN' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                {t === 'IN' ? '+ Money In' : '- Money Out'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <label className={LABEL_CLS}>Amount (₹)</label>
            <input
              type="number" step="0.01" min="0.01" required
              value={form.amount} onChange={set('amount')}
              placeholder="0.00" className={INPUT_CLS}
            />
          </div>

          {/* Category */}
          <div>
            <label className={LABEL_CLS}>Category</label>
            <select required value={form.category} onChange={set('category')} className={INPUT_CLS}>
              <option value="">Select category…</option>
              {currentCategories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div>
            <label className={LABEL_CLS}>Payment Mode</label>
            <select value={form.mode} onChange={set('mode')} className={INPUT_CLS}>
              <option value="cash">Cash</option>
              <option value="online">Online / UPI / Card</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label className={LABEL_CLS}>Date</label>
            <input
              type="date" required
              value={form.transaction_date} onChange={set('transaction_date')}
              className={INPUT_CLS}
            />
          </div>

          {/* Description */}
          <div>
            <label className={LABEL_CLS}>Description (optional)</label>
            <input
              type="text"
              value={form.description} onChange={set('description')}
              placeholder="e.g. Morning sales, monthly rent…"
              className={INPUT_CLS}
            />
          </div>

          {/* Attachment */}
          <div>
            <label className={LABEL_CLS}>Attachment (optional)</label>
            <input
              ref={fileRef} type="file" accept="image/*,.pdf"
              onChange={(e) => setForm((f) => ({ ...f, attachment: e.target.files[0] || null }))}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className={`flex-1 btn-primary ${type === 'OUT' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : ''}`}
            >
              {loading ? 'Saving…' : `Add ${type === 'IN' ? 'Income' : 'Expense'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
