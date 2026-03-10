/**
 * New Bill — cashier screen.
 *
 * Flow (mirrors Odoo's sale order + pricelist auto-fill):
 *  1. Search customer by phone → auto-load name + balance
 *  2. Search product by name/SKU → auto-fill price from customer pricelist
 *  3. Cashier can override the price (is_price_overridden tracked server-side)
 *  4. Confirm order → backend atomically posts credit ledger entry
 */
import { useEffect, useRef, useState } from 'react'
import { getCustomers } from '../api/customers'
import { createOrder, confirmOrder } from '../api/orders'
import { lookupPrice } from '../api/pricing'
import { getProducts } from '../api/products'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function NewBill() {
  // ── Customer ──────────────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [showCustomerDrop, setShowCustomerDrop] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [customer, setCustomer] = useState(null)
  const [customerError, setCustomerError] = useState('')
  const customerDropRef = useRef(null)
  const debouncedCustomer = useDebounce(customerSearch, 250)

  // ── Product search ────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  const debouncedSearch = useDebounce(productSearch, 300)

  // ── Bill lines ────────────────────────────────────────────────────────
  const [lines, setLines] = useState([])

  // ── Order state ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [confirmedOrder, setConfirmedOrder] = useState(null)
  const [submitError, setSubmitError] = useState('')

  // Search customers as user types (name or phone)
  useEffect(() => {
    if (!debouncedCustomer.trim()) { setCustomerResults([]); setShowCustomerDrop(false); return }
    setCustomerLoading(true)
    getCustomers({ search: debouncedCustomer.trim(), is_active: true, page_size: 8 })
      .then(({ data }) => {
        setCustomerResults(data.results || [])
        setShowCustomerDrop(true)
        setHighlightedIdx(-1)
      })
      .catch(() => setCustomerResults([]))
      .finally(() => setCustomerLoading(false))
  }, [debouncedCustomer])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (!customerDropRef.current?.contains(e.target)) setShowCustomerDrop(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectCustomer = (c) => {
    setCustomer(c)
    setCustomerSearch(c.name)
    setShowCustomerDrop(false)
    setCustomerError('')
  }

  const handleCustomerKeyDown = (e) => {
    if (!showCustomerDrop || customerResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIdx((i) => Math.min(i + 1, customerResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault()
      selectCustomer(customerResults[highlightedIdx])
    } else if (e.key === 'Escape') {
      setShowCustomerDrop(false)
    }
  }

  // Search products
  useEffect(() => {
    if (!debouncedSearch.trim()) { setProductResults([]); return }
    setProductSearchLoading(true)
    getProducts({ search: debouncedSearch, is_active: true, page_size: 8 })
      .then(({ data }) => setProductResults(data.results || []))
      .catch(() => setProductResults([]))
      .finally(() => setProductSearchLoading(false))
  }, [debouncedSearch])

  // Add product line — auto-fill price from pricelist
  const addProduct = async (product) => {
    setProductSearch('')
    setProductResults([])

    let price = Number(product.base_price)
    let isCustom = false

    if (customer) {
      try {
        const { data } = await lookupPrice(customer.id, product.id)
        price = Number(data.data.price)
        isCustom = data.data.is_custom_price
      } catch {
        // fallback to base_price
      }
    }

    setLines((prev) => {
      const existing = prev.findIndex((l) => l.product_id === product.id)
      if (existing >= 0) {
        // Increment quantity instead of adding duplicate
        return prev.map((l, i) =>
          i === existing ? { ...l, quantity: l.quantity + 1 } : l
        )
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: 1,
        unit_price: price,
        base_price: Number(product.base_price),
        is_custom_price: isCustom,
        is_overridden: false,
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

  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx))

  const total = lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0)

  // Submit: create draft order then immediately confirm
  const handleConfirm = async () => {
    if (!customer) return
    if (lines.length === 0) { setSubmitError('Add at least one product.'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data: orderData } = await createOrder({
        customer: customer.id,
        items: lines.map((l) => ({
          product: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      })
      const orderId = orderData.data.id
      const { data: confirmed } = await confirmOrder(orderId)
      setConfirmedOrder(confirmed.data)
    } catch (err) {
      setSubmitError(err.response?.data?.error?.message || 'Failed to confirm order.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setCustomerSearch('')
    setCustomerResults([])
    setCustomer(null)
    setLines([])
    setConfirmedOrder(null)
    setSubmitError('')
    setCustomerError('')
  }

  // ── Confirmed receipt ─────────────────────────────────────────────────
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
            {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-500 mt-1">Customer: {confirmedOrder.customer_name}</p>
          <button onClick={reset} className="btn-primary mt-6">New Bill</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">New Bill</h2>

      {/* Customer search */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-3">Customer</h3>
        <div className="relative" ref={customerDropRef}>
          <input
            type="text"
            placeholder="Search by name or phone…"
            className="input"
            value={customerSearch}
            onChange={(e) => { setCustomerSearch(e.target.value); setCustomer(null) }}
            onKeyDown={handleCustomerKeyDown}
            onFocus={() => customerResults.length > 0 && setShowCustomerDrop(true)}
            autoComplete="off"
          />
          {customerLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>
          )}

          {showCustomerDrop && customerResults.length > 0 && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {customerResults.map((c, i) => (
                <button
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); selectCustomer(c) }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-gray-100 last:border-0 ${i === highlightedIdx ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                >
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.phone} · <span className="capitalize">{c.customer_type}</span></p>
                  </div>
                  {Number(c.outstanding_balance) > 0 && (
                    <span className="text-xs font-semibold text-red-600">
                      Bal: {Number(c.outstanding_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {showCustomerDrop && customerResults.length === 0 && debouncedCustomer && !customerLoading && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-500">
              No customers found.
            </div>
          )}
        </div>

        {customerError && <p className="text-sm text-red-600 mt-2">{customerError}</p>}

        {customer && (
          <div className="mt-3 p-3 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-semibold text-brand-800">{customer.name}</p>
              <p className="text-xs text-gray-500">{customer.phone} · {customer.customer_type}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Outstanding</p>
              <p className={`font-bold ${Number(customer.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Number(customer.outstanding_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Product search */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-3">Add Products</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or SKU…"
            className="input"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            disabled={!customer}
          />
          {!customer && (
            <p className="text-xs text-gray-400 mt-1">Find a customer first to auto-fill prices.</p>
          )}

          {productResults.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku} · {p.unit}</p>
                  </div>
                  <p className="text-sm font-semibold text-brand-600">
                    {Number(p.base_price).toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bill lines */}
      {lines.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'Qty', 'Unit Price', 'Total', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.product_name}</p>
                    <p className="text-xs text-gray-400">{l.sku} · {l.unit}
                      {l.is_custom_price && <span className="ml-1 text-brand-500">(custom price)</span>}
                      {l.is_overridden && <span className="ml-1 text-amber-500">(overridden)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      className="input w-20 text-center"
                      value={l.quantity}
                      onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input w-28 text-right"
                      value={l.unit_price}
                      onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {(l.quantity * Number(l.unit_price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total + confirm */}
          <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex gap-3 items-center">
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <button onClick={reset} className="btn-secondary">Clear</button>
              <button onClick={handleConfirm} disabled={submitting || !customer} className="btn-primary px-6">
                {submitting ? 'Processing…' : 'Confirm & Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
