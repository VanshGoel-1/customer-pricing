import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCustomer, getCustomerLedger, postLedgerEntry, updateCustomer } from '../api/customers'
import { getCustomerPricelist } from '../api/pricing'
import { getPriceHistory } from '../api/pricing'
import { setCustomerPrice } from '../api/pricing'
import { getProducts } from '../api/products'

export default function CustomerProfile() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [ledger, setLedger] = useState([])
  const [pricelist, setPricelist] = useState(null)
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('ledger')

  // Set price form
  const [products, setProducts] = useState([])
  const [priceForm, setPriceForm] = useState({ product_id: '', price: '', effective_from: new Date().toISOString().split('T')[0] })
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceError, setPriceError] = useState('')

  // Edit profile form
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editProfileForm, setEditProfileForm] = useState({})
  const [editProfileSaving, setEditProfileSaving] = useState(false)
  const [editProfileError, setEditProfileError] = useState('')

  // Payment form
  const [payForm, setPayForm] = useState({ amount: '', notes: '' })
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  const load = async () => {
    const [custRes, ledgerRes, plRes, histRes] = await Promise.all([
      getCustomer(id),
      getCustomerLedger(id),
      getCustomerPricelist(id),
      getPriceHistory({ customer: id }),
    ])
    setCustomer(custRes.data.data || custRes.data)
    setLedger(ledgerRes.data.results || ledgerRes.data)
    setPricelist(plRes.data.data || plRes.data)
    setHistory(histRes.data.results || histRes.data)
  }

  useEffect(() => {
    load()
    getProducts({ is_active: true, page_size: 200 }).then(({ data }) => setProducts(data.results || []))
  }, [id])

  const handleEditProfileClick = () => {
    setEditProfileForm({ name: customer.name, phone: customer.phone, email: customer.email || '', customer_type: customer.customer_type, credit_limit: customer.credit_limit })
    setEditProfileError('')
    setShowEditProfile(true)
  }

  const handleEditProfileSave = async (e) => {
    e.preventDefault()
    setEditProfileSaving(true)
    setEditProfileError('')
    try {
      await updateCustomer(id, editProfileForm)
      setShowEditProfile(false)
      load()
    } catch (err) {
      const detail = err.response?.data?.error?.detail || {}
      setEditProfileError(Object.values(detail).flat().join(' ') || err.response?.data?.error?.message || 'Failed to update profile.')
    } finally {
      setEditProfileSaving(false)
    }
  }

  const handleSetPrice = async (e) => {
    e.preventDefault()
    setPriceSaving(true)
    setPriceError('')
    try {
      await setCustomerPrice({ customer_id: Number(id), product_id: Number(priceForm.product_id), price: priceForm.price, effective_from: priceForm.effective_from })
      load()
    } catch (err) {
      setPriceError(err.response?.data?.error?.message || 'Failed to set price.')
    } finally { setPriceSaving(false) }
  }

  const handlePayment = async (e) => {
    e.preventDefault()
    setPaySaving(true)
    setPayError('')
    try {
      await postLedgerEntry(id, { customer: Number(id), date: new Date().toISOString().split('T')[0], entry_type: 'payment', amount: payForm.amount, notes: payForm.notes })
      setPayForm({ amount: '', notes: '' })
      load()
    } catch (err) {
      setPayError(err.response?.data?.error?.message || 'Failed to post payment.')
    } finally { setPaySaving(false) }
  }

  if (!customer) return <p className="text-gray-400">Loading…</p>

  const ledgerTypeColor = { credit: 'text-red-600', payment: 'text-green-600', adjustment: 'text-amber-600' }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="card flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{customer.name}</h2>
          <p className="text-gray-500 text-sm">{customer.phone} · {customer.email}</p>
          <p className="text-sm mt-1 capitalize text-gray-500">{customer.customer_type}</p>
          <button onClick={handleEditProfileClick} className="mt-2 text-xs text-brand-600 hover:underline">
            Edit Profile
          </button>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Outstanding Balance</p>
          <p className={`text-3xl font-bold ${Number(customer.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {Number(customer.outstanding_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-400">Limit: {Number(customer.credit_limit).toLocaleString()}</p>
        </div>
      </div>

      {showEditProfile && (
        <div className="card">
          <h3 className="font-semibold mb-4">Edit Profile</h3>
          <form onSubmit={handleEditProfileSave} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input required maxLength={255} className="input" value={editProfileForm.name} onChange={(e) => setEditProfileForm({ ...editProfileForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input required maxLength={30} className="input" value={editProfileForm.phone} onChange={(e) => setEditProfileForm({ ...editProfileForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input" value={editProfileForm.email} onChange={(e) => setEditProfileForm({ ...editProfileForm, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
              <select className="input" value={editProfileForm.customer_type} onChange={(e) => setEditProfileForm({ ...editProfileForm, customer_type: e.target.value })}>
                <option value="wholesale">Wholesale</option>
                <option value="restaurant">Restaurant / Hotel</option>
                <option value="retail">Retail</option>
                <option value="walkin">Walk-in</option>
                <option value="distributor">Distributor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
              <input type="number" min="0" step="0.01" className="input" value={editProfileForm.credit_limit} onChange={(e) => setEditProfileForm({ ...editProfileForm, credit_limit: e.target.value })} />
            </div>
            {editProfileError && <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{editProfileError}</p>}
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowEditProfile(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={editProfileSaving} className="btn-primary">{editProfileSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        {['ledger', 'prices', 'history', 'payment'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors mr-1
              ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'history' ? 'Price History' : t === 'payment' ? 'Post Payment' : t === 'prices' ? 'Custom Prices' : 'Ledger'}
          </button>
        ))}
      </div>

      {/* Ledger */}
      {tab === 'ledger' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              {['Date', 'Type', 'Amount', 'Notes'].map((h) => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">{e.date}</td>
                  <td className="px-4 py-3"><span className={`font-medium ${ledgerTypeColor[e.entry_type]}`}>{e.entry_type_display}</span></td>
                  <td className="px-4 py-3 font-semibold">{Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-gray-500">{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Custom prices */}
      {tab === 'prices' && (
        <div className="space-y-4">
          <form onSubmit={handleSetPrice} className="card">
            <h3 className="font-semibold mb-4">Set / Update Product Price</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                <select required className="input" value={priceForm.product_id} onChange={(e) => setPriceForm({ ...priceForm, product_id: e.target.value })}>
                  <option value="">Select…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                <input required type="number" min="0" step="0.01" className="input" value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
                <input required type="date" className="input" value={priceForm.effective_from} onChange={(e) => setPriceForm({ ...priceForm, effective_from: e.target.value })} />
              </div>
            </div>
            {priceError && (
              <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{priceError}</p>
            )}
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={priceSaving} className="btn-primary">{priceSaving ? 'Saving…' : 'Set Price'}</button>
            </div>
          </form>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>
                {['Product', 'Price', 'Effective From', 'Effective To'].map((h) => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {(pricelist?.items || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.product_name} <span className="text-xs text-gray-400">{item.product_sku}</span></td>
                    <td className="px-4 py-3 font-semibold">{Number(item.price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{item.effective_from}</td>
                    <td className="px-4 py-3 text-gray-500">{item.effective_to || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Price history */}
      {tab === 'history' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              {['Product', 'v#', 'Old Price', 'New Price', 'Changed By', 'Date'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3">{h.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">v{h.version}</td>
                  <td className="px-4 py-3 text-gray-400 line-through">{Number(h.old_price).toFixed(2)}</td>
                  <td className="px-4 py-3 font-semibold text-brand-600">{Number(h.new_price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{h.changed_by_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(h.changed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Post payment */}
      {tab === 'payment' && (
        <form onSubmit={handlePayment} className="card max-w-sm space-y-4">
          <h3 className="font-semibold">Post Payment</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input required type="number" min="0.01" step="0.01" className="input" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          </div>
          {payError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{payError}</p>
          )}
          <button type="submit" disabled={paySaving} className="btn-primary w-full">{paySaving ? 'Posting…' : 'Post Payment'}</button>
        </form>
      )}
    </div>
  )
}
