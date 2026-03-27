import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  confirmPurchase,
  createSupplierPayment,
  deletePurchase,
  getSupplier,
  getSupplierLedger,
  getSupplierPayments,
  getPurchases,
  markPurchasePaid,
  updateSupplier,
} from '../api/suppliers'
import { useAuth } from '../context/AuthContext'
import AddPurchaseInvoiceModal from '../components/AddPurchaseInvoiceModal'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

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

const MODE_COLOR = {
  cash:   'bg-green-100 text-green-700',
  online: 'bg-blue-100 text-blue-700',
  cheque: 'bg-purple-100 text-purple-700',
  bank:   'bg-indigo-100 text-indigo-700',
}

const TABS = ['Invoices', 'Payments', 'Ledger', 'Products']

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isManager } = useAuth()

  const [supplier, setSupplier] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('Invoices')

  // Invoices tab
  const [purchases, setPurchases] = useState([])
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceActionError, setInvoiceActionError] = useState('')

  // Payments tab
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    mode: 'cash',
    reference_invoice: '',
    note: '',
    payment_date: new Date().toISOString().slice(0, 10),
  })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState(null)

  // Ledger tab
  const [ledger, setLedger] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  // Products (Catalog) tab
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [productForm, setProductForm] = useState({ product: '', internal_description: '' })
  const [productSaving, setProductSaving] = useState(false)
  const [productError, setProductError] = useState(null)
  const [prodSearch, setProdSearch] = useState('')
  const [prodResults, setProdResults] = useState([])
  const [prodSearchLoading, setProdSearchLoading] = useState(false)
  const [selectedProdName, setSelectedProdName] = useState('')

  // Edit supplier
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  const loadSupplier = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await getSupplier(id)
      setSupplier(data)
      setEditForm({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        gstin: data.gstin || '',
        notes: data.notes || '',
      })
    } catch {
      setError('Failed to load supplier.')
    } finally {
      setLoading(false)
    }
  }

  const loadPurchases = async () => {
    setPurchasesLoading(true)
    try {
      const { data } = await getPurchases({ supplier: id, page_size: 100 })
      setPurchases(data.results || data || [])
    } catch {
      // silently fail — error shown on demand
    } finally {
      setPurchasesLoading(false)
    }
  }

  const loadPayments = async () => {
    setPaymentsLoading(true)
    try {
      const { data } = await getSupplierPayments(id)
      setPayments(data.results || data || [])
    } catch {
      // silently fail
    } finally {
      setPaymentsLoading(false)
    }
  }

  const loadLedger = async () => {
    setLedgerLoading(true)
    try {
      const { data } = await getSupplierLedger(id)
      setLedger(data.data || data.results || [])
    } catch {
      // silently fail
    } finally {
      setLedgerLoading(false)
    }
  }

  const loadCatalog = async () => {
    setCatalogLoading(true)
    try {
      const { data } = await getSupplierProducts(id)
      setCatalog(data.results || data || [])
    } catch {
      // silently fail
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => { loadSupplier() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'Invoices') loadPurchases()
    else if (activeTab === 'Payments') loadPayments()
    else if (activeTab === 'Ledger') loadLedger()
    else if (activeTab === 'Products') loadCatalog()
  }, [activeTab, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edit supplier
  const handleEditSave = async (e) => {
    e.preventDefault()
    setEditSaving(true)
    setEditError(null)
    try {
      const { data } = await updateSupplier(id, editForm)
      setSupplier(data)
      setEditing(false)
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join(' | ')
        setEditError(msgs)
      } else {
        setEditError('Failed to update supplier.')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const setEdit = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }))

  // Invoice actions
  const handleConfirmPurchase = async (purchaseId, e) => {
    e.stopPropagation()
    setInvoiceActionError('')
    try {
      await confirmPurchase(purchaseId)
      loadPurchases()
      loadSupplier()
    } catch (err) {
      setInvoiceActionError(err.response?.data?.error?.message || 'Failed to confirm invoice.')
    }
  }

  const handleMarkPurchasePaid = async (purchaseId, e) => {
    e.stopPropagation()
    setInvoiceActionError('')
    try {
      await markPurchasePaid(purchaseId)
      loadPurchases()
      loadSupplier()
    } catch (err) {
      setInvoiceActionError(err.response?.data?.error?.message || 'Failed to mark as paid.')
    }
  }

  const handleDeletePurchase = async (purchaseId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this draft invoice?')) return
    setInvoiceActionError('')
    try {
      await deletePurchase(purchaseId)
      loadPurchases()
    } catch (err) {
      setInvoiceActionError(err.response?.data?.error?.message || 'Failed to delete invoice.')
    }
  }

  // Record payment
  const setPayField = (k) => (e) => setPaymentForm((f) => ({ ...f, [k]: e.target.value }))

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      setPaymentError('Enter a valid amount.')
      return
    }
    setPaymentSaving(true)
    setPaymentError(null)
    try {
      await createSupplierPayment(id, {
        amount: parseFloat(paymentForm.amount),
        mode: paymentForm.mode,
        reference_invoice: paymentForm.reference_invoice || undefined,
        note: paymentForm.note || undefined,
        payment_date: paymentForm.payment_date,
      })
      setPaymentForm({
        amount: '',
        mode: 'cash',
        reference_invoice: '',
        note: '',
        payment_date: new Date().toISOString().slice(0, 10),
      })
      loadPayments()
      loadSupplier()
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join(' | ')
        setPaymentError(msgs)
      } else {
        setPaymentError('Failed to record payment.')
      }
    } finally {
      setPaymentSaving(false)
    }
  }

  // Catalog actions
  const searchProds = async (q) => {
    if (!q || q.length < 2) { setProdResults([]); return }
    setProdSearchLoading(true)
    try {
      const { data } = await client.get('/products/', { params: { search: q, page_size: 5 } })
      setProdResults(data.results || data || [])
    } catch {
      setProdResults([])
    } finally {
      setProdSearchLoading(false)
    }
  }

  const handleCatalogAdd = async (e) => {
    e.preventDefault()
    if (!productForm.product) { setProductError('Please select a product.'); return }
    setProductSaving(true)
    setProductError(null)
    try {
      await linkSupplierProduct(id, productForm)
      setProductForm({ product: '', internal_description: '' })
      setSelectedProdName('')
      setProdSearch('')
      setShowProductModal(false)
      loadCatalog()
    } catch (err) {
      setProductError(err.response?.data?.error?.message || 'Failed to link product.')
    } finally {
      setProductSaving(false)
    }
  }

  const handleCatalogRemove = async (cpId) => {
    if (!window.confirm('Remove this product from supplier catalog?')) return
    try {
      await client.delete(`/suppliers/${id}/products/${cpId}/`)
      loadCatalog()
    } catch (err) {
      alert('Failed to remove product from catalog.')
    }
  }

  // Ledger running balance
  const ledgerWithBalance = (() => {
    let running = 0
    return (ledger || []).map((entry) => {
      if (entry.entry_type === 'DR' || entry.entry_type === 'debit') {
        running += Number(entry.amount ?? 0)
      } else {
        running -= Number(entry.amount ?? 0)
      }
      return { ...entry, running_balance: running }
    })
  })()

  if (loading) return <div className="card text-center py-12 text-gray-400">Loading…</div>
  if (error) return <div className="card text-center py-12 text-red-500">{error}</div>

  const balance = Number(supplier?.outstanding_balance ?? 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => navigate('/suppliers')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Suppliers
        </button>

        <div className="card">
          {editing ? (
            <form onSubmit={handleEditSave} className="space-y-4">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Edit Supplier</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Name *</label>
                  <input type="text" required value={editForm.name} onChange={setEdit('name')} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Phone</label>
                  <input type="tel" value={editForm.phone} onChange={setEdit('phone')} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Email</label>
                  <input type="email" value={editForm.email} onChange={setEdit('email')} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>GSTIN</label>
                  <input type="text" value={editForm.gstin} onChange={setEdit('gstin')} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Address</label>
                <textarea rows={2} value={editForm.address} onChange={setEdit('address')} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Notes</label>
                <textarea rows={2} value={editForm.notes} onChange={setEdit('notes')} className={INPUT_CLS} />
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={editSaving} className="btn-primary">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-gray-900">{supplier.name}</h2>
                {supplier.phone && <p className="text-sm text-gray-500">{supplier.phone}</p>}
                {supplier.email && <p className="text-sm text-gray-500">{supplier.email}</p>}
                {supplier.gstin && (
                  <p className="text-xs font-mono text-gray-400">GSTIN: {supplier.gstin}</p>
                )}
                {supplier.address && (
                  <p className="text-sm text-gray-400 max-w-md">{supplier.address}</p>
                )}
                {supplier.notes && (
                  <p className="text-sm italic text-gray-400">{supplier.notes}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0 ml-6">
                <p className="text-xs text-gray-400 mb-1">Outstanding Balance</p>
                <p className={`text-3xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{fmt(balance)}
                </p>
                {balance === 0 && <p className="text-xs text-green-500 mt-1">Fully settled</p>}
                {isManager && (
                  <button onClick={() => setEditing(true)} className="btn-secondary text-xs mt-3">
                    Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 px-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Invoices Tab ── */}
      {activeTab === 'Invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Purchase Invoices</h3>
            {isManager && (
              <button onClick={() => setShowInvoiceModal(true)} className="btn-primary text-sm">
                + New Invoice
              </button>
            )}
          </div>

          {invoiceActionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {invoiceActionError}
            </div>
          )}

          {purchasesLoading ? (
            <div className="card text-center py-12 text-gray-400">Loading…</div>
          ) : purchases.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              <p>No invoices yet.</p>
              {isManager && (
                <button onClick={() => setShowInvoiceModal(true)} className="btn-primary mt-4">
                  Create first invoice
                </button>
              )}
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Invoice #', 'Date', 'Total', 'Status', 'Deal', ...(isManager ? ['Actions'] : [])].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-brand-600">
                        {p.invoice_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(p.invoice_date)}
                      </td>
                      <td className="px-4 py-3 font-semibold">₹{fmt(p.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'}`}>
                          {p.status_display || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.deal_label ? (
                          <span className={`badge ${DEAL_COLOR[p.deal_label] || 'bg-gray-100 text-gray-600'}`}>
                            {p.deal_label.charAt(0).toUpperCase() + p.deal_label.slice(1)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {isManager && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            {p.status === 'draft' && (
                              <>
                                <button
                                  onClick={(e) => handleConfirmPurchase(p.id, e)}
                                  className="text-xs text-blue-600 hover:underline font-medium"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={(e) => handleDeletePurchase(p.id, e)}
                                  className="text-xs text-red-500 hover:underline"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {p.status === 'confirmed' && (
                              <button
                                onClick={(e) => handleMarkPurchasePaid(p.id, e)}
                                className="text-xs text-green-600 hover:underline font-medium"
                              >
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Payments Tab ── */}
      {activeTab === 'Payments' && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-800">Payments</h3>

          {/* Record payment form */}
          {isManager && (
            <div className="card">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Record Payment</h4>
              <form onSubmit={handleRecordPayment} className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Amount (₹) *</label>
                    <input
                      type="number" min="0.01" step="0.01" required
                      value={paymentForm.amount}
                      onChange={setPayField('amount')}
                      placeholder="0.00"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Mode</label>
                    <select value={paymentForm.mode} onChange={setPayField('mode')} className={INPUT_CLS}>
                      <option value="cash">Cash</option>
                      <option value="online">Online / UPI</option>
                      <option value="cheque">Cheque</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Date</label>
                    <input
                      type="date" required
                      value={paymentForm.payment_date}
                      onChange={setPayField('payment_date')}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Reference Invoice # (optional)</label>
                    <input
                      type="text"
                      value={paymentForm.reference_invoice}
                      onChange={setPayField('reference_invoice')}
                      placeholder="INV-001"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Note (optional)</label>
                    <input
                      type="text"
                      value={paymentForm.note}
                      onChange={setPayField('note')}
                      placeholder="e.g. NEFT, cheque no…"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
                {paymentError && <p className="text-sm text-red-600">{paymentError}</p>}
                <button type="submit" disabled={paymentSaving} className="btn-primary">
                  {paymentSaving ? 'Recording…' : 'Record Payment'}
                </button>
              </form>
            </div>
          )}

          {/* Payments list */}
          {paymentsLoading ? (
            <div className="card text-center py-12 text-gray-400">Loading…</div>
          ) : payments.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">No payments recorded.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Date', 'Amount', 'Mode', 'Reference Invoice', 'Note'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(pay.payment_date || pay.created_at)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-600">₹{fmt(pay.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${MODE_COLOR[pay.mode] || 'bg-gray-100 text-gray-600'}`}>
                          {pay.mode_display || pay.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {pay.reference_invoice || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                        {pay.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Ledger Tab ── */}
      {activeTab === 'Ledger' && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-800">Ledger</h3>

          {ledgerLoading ? (
            <div className="card text-center py-12 text-gray-400">Loading…</div>
          ) : ledgerWithBalance.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">No ledger entries yet.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Date', 'Type', 'Description', 'Reference', 'Amount', 'Balance'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ledgerWithBalance.map((entry, i) => {
                    const isDr = entry.entry_type === 'DR' || entry.entry_type === 'debit'
                    return (
                      <tr key={entry.reference_id || i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge ${isDr ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                            {isDr ? 'DR' : 'CR'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                          {entry.description || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {entry.reference_id || '—'}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${isDr ? 'text-red-600' : 'text-green-600'}`}>
                          {isDr ? '+' : '−'} ₹{fmt(entry.amount)}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${entry.running_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{fmt(Math.abs(entry.running_balance))}
                          <span className="text-xs font-normal text-gray-400 ml-1">
                            {entry.running_balance > 0 ? 'DR' : entry.running_balance < 0 ? 'CR' : ''}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Products (Catalog) Tab ── */}
      {activeTab === 'Products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Supplier Catalog</h3>
            {isManager && (
              <button
                onClick={() => {
                  setShowProductModal(true)
                  setProductError(null)
                  setProductForm({ product: '', internal_description: '' })
                  setSelectedProdName('')
                  setProdSearch('')
                }}
                className="btn-primary text-sm"
              >
                + Add Product
              </button>
            )}
          </div>

          <p className="text-sm text-gray-500">
            Products that this supplier provides with internal descriptions.
          </p>

          {catalogLoading ? (
            <div className="card text-center py-12 text-gray-400">Loading…</div>
          ) : catalog.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">
              No products in catalog yet.
              {isManager && (
                <button onClick={() => setShowProductModal(true)} className="btn-primary mt-4 block mx-auto">
                  Add Catalog Product
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalog.map((cp) => (
                <div key={cp.product} className="card p-4 flex flex-col justify-between hover:border-brand-300 transition-colors group">
                  <div>
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold text-gray-900">{cp.product_name}</h4>
                      {isManager && (
                        <button
                          onClick={() => handleCatalogRemove(cp.id)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {cp.internal_description ? (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded italic">
                        “{cp.internal_description}”
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 mt-2 italic">No internal description.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add Product to Catalog</h2>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCatalogAdd} className="px-6 py-5 space-y-4">
              <div className="relative">
                <label className={LABEL_CLS}>Product *</label>
                {productForm.product ? (
                  <div className="flex items-center justify-between bg-brand-50 rounded px-3 py-2 border border-brand-200">
                    <span className="text-sm font-medium text-brand-700">{selectedProdName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setProductForm(f => ({ ...f, product: '' }))
                        setSelectedProdName('')
                      }}
                      className="text-gray-400 hover:text-red-500 ml-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search product…"
                      value={prodSearch}
                      onChange={(e) => {
                        setProdSearch(e.target.value)
                        searchProds(e.target.value)
                      }}
                      className={INPUT_CLS}
                    />
                    {prodResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {prodResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setProductForm(f => ({ ...f, product: p.id }))
                              setSelectedProdName(p.name || p.title)
                              setProdResults([])
                              setProdSearch('')
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                          >
                            {p.name || p.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className={LABEL_CLS}>Internal Description</label>
                <textarea
                  rows={3}
                  value={productForm.internal_description}
                  onChange={(e) => setProductForm(f => ({ ...f, internal_description: e.target.value }))}
                  placeholder="e.g. Good delivery speed…"
                  className={INPUT_CLS}
                />
              </div>

              {productError && <p className="text-sm text-red-600">{productError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowProductModal(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={productSaving} className="flex-1 btn-primary">
                  {productSaving ? 'Adding…' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Invoice Modal */}
      {showInvoiceModal && (
        <AddPurchaseInvoiceModal
          supplierId={id}
          onClose={() => setShowInvoiceModal(false)}
          onSaved={() => {
            setShowInvoiceModal(false)
            loadPurchases()
            loadSupplier()
          }}
        />
      )}
    </div>
  )
}
