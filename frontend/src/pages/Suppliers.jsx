import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSupplier, getSuppliers } from '../api/suppliers'
import { useAuth } from '../context/AuthContext'

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

function SummaryCard({ label, value, colorCls, prefix = '' }) {
  return (
    <div className={`card border-l-4 ${colorCls}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{prefix}{value}</p>
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  notes: '',
}

export default function Suppliers() {
  const { isManager } = useAuth()
  const navigate = useNavigate()

  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const load = async (searchVal) => {
    setLoading(true)
    setError(null)
    try {
      const params = { page_size: 200 }
      if (searchVal) params.search = searchVal
      const { data } = await getSuppliers(params)
      setSuppliers(data.results || data || [])
    } catch {
      setError('Failed to load suppliers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalOutstanding = suppliers.reduce((sum, s) => sum + Number(s.outstanding_balance ?? 0), 0)
  const withBalance = suppliers.filter((s) => Number(s.outstanding_balance ?? 0) > 0).length

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError(null)
    try {
      await createSupplier(form)
      setShowAddModal(false)
      setForm(EMPTY_FORM)
      load(search)
    } catch (err) {
      const detail = err.response?.data
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join(' | ')
        setFormError(msgs)
      } else {
        setFormError('Failed to save supplier.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Suppliers</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your supply chain partners</p>
        </div>
        {isManager && (
          <button onClick={() => { setShowAddModal(true); setFormError(null); setForm(EMPTY_FORM) }} className="btn-primary">
            + Add Supplier
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Total Suppliers" value={suppliers.length} colorCls="border-brand-500" />
        <SummaryCard label="Total Outstanding" value={fmt(totalOutstanding)} colorCls="border-red-500" prefix="₹" />
        <SummaryCard label="Suppliers with Balance" value={withBalance} colorCls="border-amber-500" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search suppliers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card text-center py-12 text-gray-400">Loading…</div>
      ) : error ? (
        <div className="card text-center py-12 text-red-500">{error}</div>
      ) : suppliers.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-lg">{search ? 'No suppliers match your search.' : 'No suppliers yet.'}</p>
          {isManager && !search && (
            <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">Add first supplier</button>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Phone', 'GSTIN', 'Outstanding Balance', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((s) => {
                const balance = Number(s.outstanding_balance ?? 0)
                return (
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/suppliers/${s.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500">{s.phone || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.gstin || '—'}</td>
                    <td className="px-4 py-3">
                      {balance > 0 ? (
                        <span className="badge bg-red-100 text-red-700 font-semibold">₹{fmt(balance)}</span>
                      ) : (
                        <span className="badge bg-green-100 text-green-700">Settled</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${s.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add Supplier</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div>
                <label className={LABEL_CLS}>Name *</label>
                <input type="text" required value={form.name} onChange={set('name')} placeholder="Supplier name" className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Phone</label>
                  <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 XXXXX XXXXX" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Email</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="supplier@email.com" className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Address</label>
                <textarea rows={2} value={form.address} onChange={set('address')} placeholder="Full address" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>GSTIN</label>
                <input type="text" value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Notes</label>
                <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Any additional notes…" className={INPUT_CLS} />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 btn-primary">
                  {saving ? 'Saving…' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
