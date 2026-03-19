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
  const [form, setForm] = useState({ name: '', last_name: '', phone: '', email: '', company_name: '', sales_rep: '', tax_tin: '', customer_type: 'retail', credit_limit: 0 })
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
      setForm({ name: '', last_name: '', phone: '', email: '', company_name: '', sales_rep: '', tax_tin: '', customer_type: 'retail', credit_limit: 0 })
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
    <div className="max-w-6xl mx-auto space-y-6">
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
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-800">Add Customer</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            {/* Row 1: Phone | Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <input required maxLength={20} type="tel" placeholder="Phone Number *" className="input pl-9" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input type="email" maxLength={254} placeholder="Email Address" className="input pl-9" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>

            {/* Row 2: First Name | Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input required maxLength={255} placeholder="* First Name" className="input pl-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input maxLength={150} placeholder="Last Name" className="input pl-9" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>

            {/* Row 3: Company | Sales Rep | Tax/TIN */}
            <div className="grid grid-cols-3 gap-3">
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <input maxLength={255} placeholder="Company Name" className="input pl-9" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input maxLength={150} placeholder="Sales Rep" className="input pl-9" value={form.sales_rep} onChange={(e) => setForm({ ...form, sales_rep: e.target.value })} />
              </div>
              <div className="relative flex items-center">
                <svg className="absolute left-3 w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <input maxLength={50} placeholder="Tax (TIN)" className="input pl-9" value={form.tax_tin} onChange={(e) => setForm({ ...form, tax_tin: e.target.value })} />
              </div>
            </div>

            {/* Row 4: Type | Credit Limit */}
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                {['wholesale','restaurant','retail','walkin','distributor','other'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Credit Limit" className="input" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between pt-2">
              <button type="button" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                <span className="text-lg font-light">+</span> Add Address
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {saving ? 'Saving…' : 'Add'}
                </button>
              </div>
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
