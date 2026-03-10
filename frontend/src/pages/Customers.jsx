import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createCustomer, deleteCustomer, getCustomers } from '../api/customers'

export default function Customers() {
  const [searchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || 'active')
  const [actionError, setActionError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', customer_type: 'retail', credit_limit: 0 })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async (q = '', f = filter) => {
    setLoading(true)
    try {
      const params = { search: q, page_size: 100 }
      if (f === 'active') params.is_active = true
      if (f === 'inactive') params.is_active = false
      const { data } = await getCustomers(params)
      setCustomers(data.results || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSearch = (e) => { setSearch(e.target.value); load(e.target.value, filter) }
  const handleFilter = (f) => { setFilter(f); load(search, f) }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await createCustomer(form)
      setShowForm(false)
      setForm({ name: '', phone: '', email: '', customer_type: 'retail', credit_limit: 0 })
      load(search, filter)
    } catch (err) {
      const detail = err.response?.data?.error?.detail || {}
      setFormError(Object.values(detail).flat().join(' ') || 'Failed to create customer.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? This will deactivate the customer.`)) return
    setActionError('')
    try {
      await deleteCustomer(c.id)
      load(search, filter)
    } catch (err) {
      setActionError(err.response?.data?.error?.message || 'Failed to delete customer.')
    }
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Customers</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Customer'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="font-semibold mb-4">New Customer</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input required maxLength={255} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input required maxLength={20} pattern="^\+?\d[\d\s\-]{6,18}$" title="7–15 digits, optional leading +" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" maxLength={254} className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select className="input" value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                {['wholesale','restaurant','retail','walkin','distributor','other'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
              <input type="number" min="0" step="0.01" className="input" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            </div>
            {formError && <p className="col-span-2 text-sm text-red-600">{formError}</p>}
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-4">
        <input type="search" placeholder="Search by name or phone…" className="input max-w-sm" value={search} onChange={handleSearch} />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {[['active','Active'],['all','All'],['inactive','Inactive']].map(([val, label]) => (
            <button key={val} onClick={() => handleFilter(val)}
              className={`px-3 py-1.5 font-medium transition-colors ${filter === val ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Phone', 'Type', 'Balance', 'Credit Limit', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50 ${!c.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                  <td className="px-4 py-3 capitalize">{c.customer_type}</td>
                  <td className="px-4 py-3">
                    <span className={Number(c.outstanding_balance) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                      {Number(c.outstanding_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {Number(c.credit_limit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link to={`/customers/${c.id}`} className="text-brand-600 hover:underline text-xs font-medium">View →</Link>
                      {c.is_active && (
                        <button onClick={() => handleDelete(c)} className="text-xs text-red-500 hover:underline">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
