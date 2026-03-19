/**
 * New Bill — billing screen.
 *
 * Customer section: image-style form, confirmation gate, smart dropdown
 * Product section: quick grid + search side-by-side (unlocked after customer confirmed)
 * Draft support: "Save as Draft" button; loads existing draft via ?draft=ID URL param
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createCustomer, getCustomers } from '../api/customers'
import { addOrderItem, cancelOrder, confirmOrder, createOrder, deleteOrderItem, getOrder } from '../api/orders'
import { lookupPrice } from '../api/pricing'
import { getProducts, getQuickProducts } from '../api/products'
import QuickProductGrid from '../components/QuickProductGrid'
import QuantityInput from '../components/QuantityInput'
import { getUnitConfig } from '../utils/unitConfig'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function computeTotals(lines) {
  let weight = 0, volume = 0, pcs = 0
  for (const l of lines) {
    const unit = l.unit?.toLowerCase()
    const qty = Number(l.quantity)
    if (unit === 'kg') weight += qty
    else if (unit === 'g') weight += qty / 1000
    else if (unit === 'l') volume += qty
    else if (unit === 'ml') volume += qty / 1000
    else pcs += qty
  }
  return { weight, volume, pcs }
}

const EMPTY_FORM = {
  name: '', last_name: '', phone: '', email: '',
  company_name: '', sales_rep: '', tax_tin: '',
  customer_type: 'retail',
}

export default function NewBill() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftId = searchParams.get('draft')   // non-null when editing an existing draft

  // ── Customer form ────────────────────────────────────────────────────────
  const [custForm, setCustForm] = useState(EMPTY_FORM)
  const [customer, setCustomer] = useState(null)
  const [customerConfirmed, setCustomerConfirmed] = useState(false)
  const [custError, setCustError] = useState('')

  // Dropdown
  const [dropResults, setDropResults] = useState([])
  const [dropVisible, setDropVisible] = useState(false)
  const [dropIndex, setDropIndex] = useState(-1)
  const [dropLocked, setDropLocked] = useState(false)
  const [activeField, setActiveField] = useState(null)
  const dropRef = useRef(null)

  // ── Product section ──────────────────────────────────────────────────────
  const [quickProducts, setQuickProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)

  // ── Bill lines ───────────────────────────────────────────────────────────
  // Each line: { line_id (if from draft), product_id, product_name, sku, unit,
  //              piece_weight_grams, quantity, unit_price, base_price,
  //              is_custom_price, is_overridden }
  const [lines, setLines] = useState([])

  // ── Order state ──────────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode] = useState('credit')
  const [submitting, setSubmitting] = useState(false)
  const [confirmedOrder, setConfirmedOrder] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [draftLoading, setDraftLoading] = useState(!!draftId)

  // ── Load quick products ──────────────────────────────────────────────────
  useEffect(() => {
    getQuickProducts()
      .then(({ data }) => setQuickProducts(data.results || data.data || []))
      .catch(() => { })
  }, [])

  // ── Load existing draft if ?draft=ID ────────────────────────────────────
  useEffect(() => {
    if (!draftId) return
    setDraftLoading(true)
    getOrder(draftId)
      .then(({ data }) => {
        const o = data.data ?? data
        if (o.status !== 'draft') {
          navigate('/bill', { replace: true })
          return
        }
        // Pre-populate customer
        setCustForm({
          name: o.customer_name || '',
          last_name: '',
          phone: o.customer_phone || '',
          email: '',
          company_name: '',
          sales_rep: '',
          tax_tin: '',
          customer_type: 'retail',
        })
        setCustomer({ id: o.customer, name: o.customer_name, phone: o.customer_phone })
        setCustomerConfirmed(true)
        setDropLocked(true)
        setPaymentMode(o.payment_mode || 'credit')
        // Pre-populate lines from existing order items
        setLines((o.items || []).map((item) => ({
          line_id: item.id,
          product_id: item.product,
          product_name: item.product_name,
          sku: item.product_sku,
          unit: item.unit,
          piece_weight_grams: item.piece_weight_grams ?? null,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          base_price: Number(item.unit_price),
          is_custom_price: false,
          is_overridden: item.is_price_overridden,
        })))
      })
      .catch(() => navigate('/bill', { replace: true }))
      .finally(() => setDraftLoading(false))
  }, [draftId, navigate])

  // ── Customer dropdown ────────────────────────────────────────────────────
  const debouncedName = useDebounce(custForm.name, 250)
  const debouncedPhone = useDebounce(custForm.phone, 250)

  const searchCustomers = useCallback(async (query) => {
    if (!query.trim()) { setDropResults([]); setDropVisible(false); return }
    try {
      const { data } = await getCustomers({ search: query.trim(), page_size: 5 })
      const results = data.results || []
      setDropResults(results)
      setDropVisible(results.length > 0)
      setDropIndex(-1)
    } catch { setDropResults([]); setDropVisible(false) }
  }, [])

  useEffect(() => {
    if (dropLocked || activeField !== 'name') return
    searchCustomers(debouncedName)
  }, [debouncedName, dropLocked, activeField, searchCustomers])

  useEffect(() => {
    if (dropLocked || activeField !== 'phone') return
    searchCustomers(debouncedPhone)
  }, [debouncedPhone, dropLocked, activeField, searchCustomers])

  useEffect(() => {
    const handler = (e) => {
      if (!dropRef.current?.contains(e.target)) { setDropVisible(false); setDropIndex(-1) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectExistingCustomer = (c) => {
    setCustForm({
      name: c.name, last_name: c.last_name || '', phone: c.phone,
      email: c.email || '', company_name: c.company_name || '',
      sales_rep: c.sales_rep || '', tax_tin: c.tax_tin || '',
      customer_type: c.customer_type,
    })
    setCustomer(c)
    setDropVisible(false)
    setDropLocked(true)
    setDropResults([])
    setCustError('')
    setCustomerConfirmed(true)
  }

  const handleCustKeyDown = (e) => {
    if (!dropVisible || dropResults.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setDropIndex((i) => Math.min(i + 1, dropResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDropIndex((i) => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && dropIndex >= 0) { e.preventDefault(); selectExistingCustomer(dropResults[dropIndex]) }
    else if (e.key === 'Escape') { setDropVisible(false); setDropIndex(-1) }
  }

  const updateCustField = (field, value) => {
    setCustForm((f) => ({ ...f, [field]: value }))
    if (customer) { setCustomer(null); setDropLocked(false); setCustomerConfirmed(false) }
    else if (customerConfirmed) setCustomerConfirmed(false)
  }

  const confirmCustomer = () => {
    if (!custForm.name.trim() || !custForm.phone.trim()) {
      setCustError('First name and phone are required.')
      return
    }
    setCustError('')
    setCustomerConfirmed(true)
  }

  // ── Product search ───────────────────────────────────────────────────────
  const debouncedSearch = useDebounce(productSearch, 300)
  useEffect(() => {
    if (!debouncedSearch.trim()) { setProductResults([]); return }
    setProductSearchLoading(true)
    getProducts({ search: debouncedSearch, is_active: true, page_size: 8 })
      .then(({ data }) => setProductResults(data.results || []))
      .catch(() => setProductResults([]))
      .finally(() => setProductSearchLoading(false))
  }, [debouncedSearch])

  // ── Add product to bill ──────────────────────────────────────────────────
  const addProduct = async (product) => {
    setProductSearch('')
    setProductResults([])
    const cfg = getUnitConfig(product.unit)
    let price = Number(product.base_price)
    let isCustom = false
    if (customer) {
      try {
        const { data } = await lookupPrice(customer.id, product.id)
        price = Number(data.data.price)
        isCustom = data.data.is_custom_price
      } catch { /* fallback */ }
    }

    // If editing a draft, also POST the item to the draft order immediately
    if (draftId) {
      try {
        const { data } = await addOrderItem(draftId, {
          product: product.id,
          quantity: cfg.default,
          unit_price: price,
        })
        const newItem = data.data ?? data
        setLines((prev) => {
          const existing = prev.findIndex((l) => l.product_id === product.id)
          if (existing >= 0) return prev   // already in draft; don't duplicate
          return [...prev, {
            line_id: newItem.id,
            product_id: product.id, product_name: product.name,
            sku: product.sku, unit: product.unit,
            piece_weight_grams: product.piece_weight_grams ?? null,
            quantity: cfg.default, unit_price: price,
            base_price: Number(product.base_price),
            is_custom_price: isCustom, is_overridden: false,
          }]
        })
      } catch { /* fallback to local-only */ }
      return
    }

    setLines((prev) => {
      const existing = prev.findIndex((l) => l.product_id === product.id)
      if (existing >= 0) {
        return prev.map((l, i) => i === existing ? { ...l, quantity: l.quantity + cfg.step } : l)
      }
      return [...prev, {
        line_id: null,
        product_id: product.id, product_name: product.name,
        sku: product.sku, unit: product.unit,
        piece_weight_grams: product.piece_weight_grams ?? null,
        quantity: cfg.default, unit_price: price,
        base_price: Number(product.base_price),
        is_custom_price: isCustom, is_overridden: false,
      }]
    })
  }

  const updateLine = (idx, field, value) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      const updated = { ...l, [field]: value }
      if (field === 'unit_price') updated.is_overridden = Number(value) !== l.base_price
      return updated
    }))
  }

  const removeLine = async (idx) => {
    const line = lines[idx]
    // If editing a draft and the item exists in backend, delete it
    if (draftId && line.line_id) {
      try { await deleteOrderItem(draftId, line.line_id) } catch { /* ignore */ }
    }
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalAmount = lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)
  const { weight, volume, pcs } = computeTotals(lines)

  // ── Resolve customer (create if new) ────────────────────────────────────
  const resolveCustomer = async () => {
    if (customer) return { ok: true, customer }
    try {
      const { data } = await createCustomer({
        name: custForm.name.trim(), last_name: custForm.last_name.trim(),
        phone: custForm.phone.trim(), email: custForm.email.trim(),
        company_name: custForm.company_name.trim(), sales_rep: custForm.sales_rep.trim(),
        tax_tin: custForm.tax_tin.trim(), customer_type: custForm.customer_type,
      })
      return { ok: true, customer: data.data }
    } catch (err) {
      return { ok: false, error: err.response?.data?.error?.message || 'Failed to create customer.' }
    }
  }

  // ── Save as Draft ────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!custForm.name.trim() || !custForm.phone.trim()) {
      setCustError('First name and phone are required to save a draft.')
      return
    }
    if (lines.length === 0) { setSubmitError('Add at least one product.'); return }
    setSubmitting(true)
    setSubmitError('')
    setCustError('')

    // If already editing a draft, just navigate back to orders (draft is already saved)
    if (draftId) {
      navigate('/orders')
      return
    }

    const result = await resolveCustomer()
    if (!result.ok) { setCustError(result.error); setSubmitting(false); return }

    try {
      await createOrder({
        customer: result.customer.id,
        payment_mode: paymentMode,
        items: lines.map((l) => ({
          product: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
        })),
      })
      navigate('/orders')
    } catch (err) {
      setSubmitError(err.response?.data?.error?.message || 'Failed to save draft.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Confirm & Bill ───────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (lines.length === 0) { setSubmitError('Add at least one product.'); return }
    setSubmitting(true)
    setSubmitError('')
    setCustError('')

    // If editing existing draft, confirm it directly
    if (draftId) {
      try {
        const { data } = await confirmOrder(draftId)
        setConfirmedOrder(data.data)
      } catch (err) {
        setSubmitError(err.response?.data?.error?.message || 'Failed to confirm order.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    const result = await resolveCustomer()
    if (!result.ok) { setCustError(result.error); setSubmitting(false); return }

    try {
      const { data: orderData } = await createOrder({
        customer: result.customer.id,
        payment_mode: paymentMode,
        items: lines.map((l) => ({
          product: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
        })),
      })
      const { data: confirmed } = await confirmOrder(orderData.data.id)
      setConfirmedOrder(confirmed.data)
    } catch (err) {
      setSubmitError(err.response?.data?.error?.message || 'Failed to confirm order.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setCustForm(EMPTY_FORM)
    setCustomer(null)
    setCustomerConfirmed(false)
    setCustError('')
    setDropLocked(false)
    setDropResults([])
    setDropVisible(false)
    setLines([])
    setPaymentMode('credit')
    setConfirmedOrder(null)
    setSubmitError('')
    setProductSearch('')
    if (draftId) navigate('/bill', { replace: true })
  }

  // ── Confirmed receipt ────────────────────────────────────────────────────
  if (confirmedOrder) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="card text-center py-10">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Order Confirmed</h2>
          <p className="text-gray-500 mt-1 font-mono text-lg">{confirmedOrder.order_number}</p>
          <p className="text-3xl font-bold text-brand-600 mt-4">
            ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-500 mt-1">{confirmedOrder.customer_name}</p>
          {(weight > 0 || volume > 0 || pcs > 0) && (
            <div className="flex justify-center gap-3 mt-3 flex-wrap text-xs">
              {weight > 0 && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">{weight.toFixed(3)} kg</span>}
              {volume > 0 && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded">{volume.toFixed(3)} L</span>}
              {pcs > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">{pcs} pcs</span>}
            </div>
          )}
          <button onClick={reset} className="btn-primary mt-6">New Bill</button>
        </div>
      </div>
    )
  }

  if (draftLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-400 py-20 text-center">Loading draft…</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {draftId ? 'Edit Draft Bill' : 'New Bill'}
        </h2>
        {draftId && (
          <span className="text-xs bg-gray-100 text-gray-600 font-medium px-3 py-1 rounded-full">
            Draft #{draftId}
          </span>
        )}
      </div>

      {/* ── Customer card ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Add Customer</h3>
          <div className="flex items-center gap-2">
            {customerConfirmed && customer && (
              <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                Existing customer
              </span>
            )}
            {customerConfirmed && !customer && (
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                New customer
              </span>
            )}
            {customerConfirmed && !draftId && (
              <button type="button" onClick={() => { setCustomerConfirmed(false); setCustomer(null); setDropLocked(false) }} className="text-xs text-brand-600 hover:underline">
                Edit
              </button>
            )}
          </div>
        </div>

        {customerConfirmed ? (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-900">
              {custForm.name}{custForm.last_name ? ` ${custForm.last_name}` : ''}
              {custForm.company_name && <span className="ml-2 font-normal text-gray-500">· {custForm.company_name}</span>}
            </p>
            <p className="text-gray-500 mt-0.5">
              {custForm.phone}
              {custForm.email && ` · ${custForm.email}`}
              {custForm.tax_tin && ` · TIN: ${custForm.tax_tin}`}
            </p>
            {customer && Number(customer.outstanding_balance) > 0 && (
              <div className="mt-2 flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
                <span className="text-red-700 text-xs">Outstanding balance</span>
                <span className="font-bold text-red-600 text-xs">
                  ₹{Number(customer.outstanding_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div ref={dropRef} className="relative space-y-3">
            {/* Row 1: Phone | Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <input type="tel" placeholder="Phone Number *" className="input pl-9" value={custForm.phone}
                  onFocus={() => setActiveField('phone')} onBlur={() => setActiveField(null)}
                  onKeyDown={handleCustKeyDown} onChange={(e) => updateCustField('phone', e.target.value)} autoComplete="off" />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input type="email" placeholder="Email Address" className="input pl-9" value={custForm.email}
                  onChange={(e) => updateCustField('email', e.target.value)} />
              </div>
            </div>

            {/* Row 2: First Name | Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input type="text" placeholder="* First Name" className="input pl-9" value={custForm.name}
                  onFocus={() => setActiveField('name')} onBlur={() => setActiveField(null)}
                  onKeyDown={handleCustKeyDown} onChange={(e) => updateCustField('name', e.target.value)} autoComplete="off" />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input type="text" placeholder="Last Name" className="input pl-9" value={custForm.last_name}
                  onChange={(e) => updateCustField('last_name', e.target.value)} />
              </div>
            </div>

            {/* Row 3: Company | Sales Rep | Tax */}
            <div className="grid grid-cols-3 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <input type="text" placeholder="Company Name" className="input pl-9" value={custForm.company_name}
                  onChange={(e) => updateCustField('company_name', e.target.value)} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input type="text" placeholder="Sales Rep" className="input pl-9" value={custForm.sales_rep}
                  onChange={(e) => updateCustField('sales_rep', e.target.value)} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <input type="text" placeholder="Tax (TIN)" className="input pl-9" value={custForm.tax_tin}
                  onChange={(e) => updateCustField('tax_tin', e.target.value)} />
              </div>
            </div>

            {/* Dropdown */}
            {dropVisible && dropResults.length > 0 && (
              <div className="absolute left-0 right-0 z-40 bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto"
                style={{ maxHeight: `${Math.min(dropResults.length, 5) * 64}px` }}>
                {dropResults.map((c, i) => (
                  <button key={c.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectExistingCustomer(c) }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left
                                border-b border-gray-100 last:border-0 transition-colors
                                ${i === dropIndex ? 'bg-brand-50 text-brand-900' : 'hover:bg-gray-50'}`}>
                    <div>
                      <p className="font-medium">{c.name}{c.last_name ? ` ${c.last_name}` : ''}</p>
                      <p className="text-xs text-gray-400">{c.phone} · <span className="capitalize">{c.customer_type}</span></p>
                    </div>
                    {Number(c.outstanding_balance) > 0 && (
                      <span className="text-xs font-semibold text-red-500 ml-2 flex-shrink-0">
                        ₹{Number(c.outstanding_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} due
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {custError && <p className="text-sm text-red-600">{custError}</p>}

            <div className="flex items-center justify-between pt-1">
              <select value={custForm.customer_type}
                onChange={(e) => setCustForm((f) => ({ ...f, customer_type: e.target.value }))}
                className="input max-w-[160px] text-sm">
                {['wholesale', 'restaurant', 'retail', 'walkin', 'distributor', 'other'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <button type="button" onClick={confirmCustomer} className="btn-primary flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Products section ─────────────────────────────────────────────── */}
      {!customerConfirmed ? (
        <div className="card bg-gray-50 border-dashed">
          <p className="text-center text-sm text-gray-400 py-4">
            Confirm the customer above to start adding products.
          </p>
        </div>
      ) : (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-700">Add Products</h3>
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Quick Add</p>
              <QuickProductGrid products={quickProducts} onAdd={addProduct} disabled={false} />
            </div>
            <div className="w-56 flex-shrink-0">
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Search</p>
              <div className="relative">
                <input type="text" placeholder="Name or SKU…" className="input text-sm"
                  value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                {productSearchLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
                )}
                {productResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {productResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left text-sm border-b border-gray-100 last:border-0">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.unit}</p>
                        </div>
                        <p className="font-semibold text-brand-600 text-xs ml-2 flex-shrink-0">
                          ₹{Number(p.base_price).toFixed(2)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill lines ───────────────────────────────────────────────────── */}
      {lines.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'Quantity', 'Unit Price (₹)', 'Total', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.product_name}</p>
                    <p className="text-xs text-gray-400">
                      {l.sku}
                      {l.is_custom_price && <span className="ml-1 text-brand-500">(custom)</span>}
                      {l.is_overridden && <span className="ml-1 text-amber-500">(overridden)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <QuantityInput unit={l.unit} value={l.quantity}
                      onChange={(v) => updateLine(i, 'quantity', v)}
                      pieceWeightGrams={l.piece_weight_grams} />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min="0" step="0.01" value={l.unit_price}
                      onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                      className="input w-28 text-right" />
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    ₹{(l.quantity * Number(l.unit_price)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {weight > 0 && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">Weight: {weight.toFixed(3)} kg</span>}
              {volume > 0 && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded">Volume: {volume.toFixed(3)} L</span>}
              {pcs > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">Pcs: {pcs}</span>}
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm font-medium">
                {[{ value: 'cash', label: 'Cash' }, { value: 'online', label: 'Online' }, { value: 'credit', label: 'Credit' }].map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setPaymentMode(value)}
                    className={`px-3 py-2 transition-colors
                      ${paymentMode === value
                        ? value === 'credit' ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 items-center ml-auto">
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                <button onClick={reset} className="btn-secondary">Clear</button>
                <button onClick={handleSaveDraft} disabled={submitting} className="btn-secondary flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {draftId ? 'Save & Exit' : 'Save Draft'}
                </button>
                <button onClick={handleConfirm} disabled={submitting || lines.length === 0} className="btn-primary px-6">
                  {submitting ? 'Processing…' : 'Confirm & Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
