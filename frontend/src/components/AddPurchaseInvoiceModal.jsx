import { useEffect, useState } from 'react'
import client from '../api/client'
import { confirmPurchase, createPurchase, getSuppliers, getSupplierProducts } from '../api/suppliers'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DEAL_OPTIONS = [
  { value: 'good', label: 'Good', color: 'text-green-700' },
  { value: 'okay', label: 'Okay', color: 'text-amber-600' },
  { value: 'bad',  label: 'Bad',  color: 'text-red-600' },
]

const QUALITY_OPTIONS = [
  { value: 'good', label: 'Good', color: 'text-green-700' },
  { value: 'okay', label: 'Okay', color: 'text-amber-600' },
  { value: 'bad',  label: 'Bad',  color: 'text-red-600' },
]

const GST_RATES = [0, 5, 12, 18, 28]

const EMPTY_ITEM = { product: '', product_name: '', quantity: '', unit_price: '', gst_rate: 18 }

export default function AddPurchaseInvoiceModal({ supplierId: initialSupplierId, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState(initialSupplierId || '')
  const [suppliers, setSuppliers] = useState([])
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierSearch, setShowSupplierSearch] = useState(false)
  const [selectedSupplierName, setSelectedSupplierName] = useState('')

  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    notes: '',
    deal_label: '',
    delivery_days: '',
    quality_rating: '',
    evaluation_notes: '',
  })
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showEval, setShowEval] = useState(false)

  // Product search
  const [productSearch, setProductSearch] = useState({})   // { [lineIndex]: searchText }
  const [productResults, setProductResults] = useState({}) // { [lineIndex]: [products] }
  const [searchLoading, setSearchLoading] = useState({})

  // Supplier Product Mappings (internal descriptions)
  const [supplierProducts, setSupplierProducts] = useState([])

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (supplierId) {
      loadSupplierProducts(supplierId)
      if (!initialSupplierId) {
        // Fetch supplier name if we only have ID
        fetchSupplierName(supplierId)
      }
    }
  }, [supplierId])

  const fetchSupplierName = async (id) => {
    try {
      const { data } = await client.get(`/suppliers/${id}/`)
      setSelectedSupplierName(data.name)
    } catch {}
  }

  const loadSupplierProducts = async (sid) => {
    try {
      const { data } = await getSupplierProducts(sid)
      setSupplierProducts(data.results || data || [])
    } catch {
      setSupplierProducts([])
    }
  }

  const searchSuppliers = async (query) => {
    if (!query) return
    try {
      const { data } = await getSuppliers({ search: query, page_size: 5 })
      setSuppliers(data.results || data || [])
      setShowSupplierSearch(true)
    } catch {}
  }

  // Search products for a line item
  const searchProducts = async (index, query) => {
    if (!query || query.length < 2) {
      setProductResults((p) => ({ ...p, [index]: [] }))
      return
    }
    setSearchLoading((s) => ({ ...s, [index]: true }))
    try {
      const { data } = await client.get('/products/', { params: { search: query, page_size: 10 } })
      setProductResults((p) => ({ ...p, [index]: data.results || data || [] }))
    } catch {
      setProductResults((p) => ({ ...p, [index]: [] }))
    } finally {
      setSearchLoading((s) => ({ ...s, [index]: false }))
    }
  }

  const handleProductSearch = (index, val) => {
    setProductSearch((p) => ({ ...p, [index]: val }))
    const t = setTimeout(() => searchProducts(index, val), 300)
    return () => clearTimeout(t)
  }

  const selectProduct = (index, product) => {
    const mapping = supplierProducts.find(sp => sp.product === product.id)
    setItems((prev) => prev.map((item, i) =>
      i === index
        ? {
            ...item,
            product: product.id,
            product_name: product.name || product.title || String(product.id),
            internal_description: mapping?.internal_description || ''
          }
        : item
    ))
    setProductSearch((p) => ({ ...p, [index]: '' }))
    setProductResults((p) => ({ ...p, [index]: [] }))
  }

  const updateItem = (index, key, value) => {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [key]: value } : item))
  }

  const addLine = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }])

  const removeLine = (index) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
    setProductSearch((p) => { const n = { ...p }; delete n[index]; return n })
    setProductResults((r) => { const n = { ...r }; delete n[index]; return n })
  }

  // Calculate totals
  const lineTotal = (item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unit_price) || 0
    const gst = parseFloat(item.gst_rate) || 0
    const base = qty * price
    return base + (base * gst / 100)
  }

  const grandTotal = items.reduce((sum, item) => sum + lineTotal(item), 0)

  const buildPayload = () => ({
    supplier: supplierId,
    invoice_number: form.invoice_number || undefined,
    invoice_date: form.invoice_date,
    notes: form.notes || undefined,
    deal_label: form.deal_label || undefined,
    delivery_days: form.delivery_days ? parseInt(form.delivery_days, 10) : undefined,
    quality_rating: form.quality_rating || undefined,
    evaluation_notes: form.evaluation_notes || undefined,
    items: items
      .filter((it) => it.product && parseFloat(it.quantity) > 0 && parseFloat(it.unit_price) >= 0)
      .map((it) => ({
        product: it.product,
        quantity: parseFloat(it.quantity),
        unit_price: parseFloat(it.unit_price),
        gst_rate: parseFloat(it.gst_rate) || 0,
      })),
  })

  const validate = () => {
    if (!supplierId) return 'Please select a supplier.'
    if (!form.invoice_date) return 'Invoice date is required.'
    const validItems = items.filter((it) => it.product && parseFloat(it.quantity) > 0 && parseFloat(it.unit_price) >= 0)
    if (validItems.length === 0) return 'Add at least one product line item.'
    return null
  }

  const handleSave = async (andConfirm = false) => {
    const msg = validate()
    if (msg) { setError(msg); return }
    setSaving(true)
    setError(null)
    try {
      const { data: envelope } = await createPurchase(buildPayload())
      if (andConfirm) {
        await confirmPurchase(envelope.data.id)
      }
      onSaved()
      onClose()
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join(' | ')
        setError(msgs)
      } else {
        setError('Failed to save invoice.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Purchase Invoice</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Supplier Selection */}
          {!initialSupplierId && (
            <div className="relative">
              <label className={LABEL_CLS}>Supplier *</label>
              {supplierId ? (
                <div className="flex items-center justify-between border border-brand-200 bg-brand-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-brand-700">{selectedSupplierName || `Supplier #${supplierId}`}</span>
                  <button
                    onClick={() => {
                      setSupplierId('')
                      setSelectedSupplierName('')
                      setSupplierProducts([])
                    }}
                    className="text-gray-400 hover:text-red-500"
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
                    placeholder="Search supplier by name…"
                    value={supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value)
                      searchSuppliers(e.target.value)
                    }}
                    className={INPUT_CLS}
                  />
                  {showSupplierSearch && suppliers.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {suppliers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSupplierId(s.id)
                            setSelectedSupplierName(s.name)
                            setShowSupplierSearch(false)
                            setSupplierSearch('')
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Invoice details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Invoice Number (optional)</label>
              <input type="text" value={form.invoice_number} onChange={setField('invoice_number')} placeholder="INV-001" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Invoice Date *</label>
              <input type="date" required value={form.invoice_date} onChange={setField('invoice_date')} className={INPUT_CLS} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={setField('notes')} placeholder="Any notes about this invoice…" className={INPUT_CLS} />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">Line Items</h3>
              <button type="button" onClick={addLine} className="text-xs text-brand-600 hover:underline font-medium">
                + Add line
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  {/* Product search */}
                  <div className="relative">
                    {item.product ? (
                        <div className="flex flex-col bg-brand-50 rounded px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-brand-700">{item.product_name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                updateItem(index, 'product', '')
                                updateItem(index, 'product_name', '')
                                updateItem(index, 'internal_description', '')
                              }}
                              className="text-gray-400 hover:text-red-500 ml-2"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {item.internal_description && (
                            <p className="text-[10px] text-brand-600 mt-1 italic">
                              Internal: {item.internal_description}
                            </p>
                          )}
                        </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Search product by name…"
                          value={productSearch[index] || ''}
                          onChange={(e) => handleProductSearch(index, e.target.value)}
                          className={INPUT_CLS}
                        />
                        {(productResults[index]?.length > 0 || searchLoading[index]) && (
                          <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                            {searchLoading[index] ? (
                              <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
                            ) : (
                              productResults[index].map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => selectProduct(index, p)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center justify-between"
                                >
                                  <span>{p.name || p.title}</span>
                                  {p.price && <span className="text-xs text-gray-400">₹{fmt(p.price)}</span>}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Qty, price, GST */}
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Qty</label>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        placeholder="1"
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Unit Price (₹)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                        placeholder="0.00"
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">GST %</label>
                      <select
                        value={item.gst_rate}
                        onChange={(e) => updateItem(index, 'gst_rate', e.target.value)}
                        className={INPUT_CLS}
                      >
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>{r}%</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total</p>
                        <p className="text-sm font-semibold text-gray-800">₹{fmt(lineTotal(item))}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        disabled={items.length === 1}
                        className="ml-2 text-gray-300 hover:text-red-500 disabled:opacity-30"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grand total */}
            <div className="mt-3 flex justify-end">
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-right">
                <p className="text-xs text-gray-500">Invoice Total (incl. GST)</p>
                <p className="text-xl font-bold text-gray-900">₹{fmt(grandTotal)}</p>
              </div>
            </div>
          </div>

          {/* Evaluation section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowEval((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <span>Evaluation (optional)</span>
              <svg className={`w-4 h-4 transition-transform ${showEval ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showEval && (
              <div className="px-4 py-4 space-y-4">
                {/* Deal Label */}
                <div>
                  <label className={LABEL_CLS}>Deal Label</label>
                  <div className="flex gap-4">
                    {DEAL_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="deal_label"
                          value={opt.value}
                          checked={form.deal_label === opt.value}
                          onChange={setField('deal_label')}
                          className="accent-brand-500"
                        />
                        <span className={`text-sm font-medium ${opt.color}`}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Quality Rating */}
                <div>
                  <label className={LABEL_CLS}>Quality Rating</label>
                  <div className="flex gap-4">
                    {QUALITY_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="quality_rating"
                          value={opt.value}
                          checked={form.quality_rating === opt.value}
                          onChange={setField('quality_rating')}
                          className="accent-brand-500"
                        />
                        <span className={`text-sm font-medium ${opt.color}`}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Delivery Days */}
                <div>
                  <label className={LABEL_CLS}>Delivery Days</label>
                  <input
                    type="number" min="0" step="1"
                    value={form.delivery_days}
                    onChange={setField('delivery_days')}
                    placeholder="e.g. 3"
                    className={`${INPUT_CLS} max-w-[120px]`}
                  />
                </div>

                {/* Evaluation Notes */}
                <div>
                  <label className={LABEL_CLS}>Evaluation Notes</label>
                  <textarea
                    rows={2}
                    value={form.evaluation_notes}
                    onChange={setField('evaluation_notes')}
                    placeholder="Any notes about this deal…"
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <div className="flex-1 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="btn-secondary"
              >
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving…' : 'Save & Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
