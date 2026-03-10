import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createProduct, deleteProduct, getCategories, getProducts, updateProduct } from '../api/products'

export default function Products() {
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all') // 'all' | 'active' | 'inactive'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', sku: '', category: '', base_price: '', unit: 'pcs', description: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = async (q = '', f = filter) => {
    setLoading(true)
    try {
      const params = { search: q, page_size: 200 }
      if (f === 'active') params.is_active = true
      if (f === 'inactive') params.is_active = false
      const { data } = await getProducts(params)
      setProducts(data.results || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    getCategories().then(({ data }) => setCategories(data.results || data))
  }, [])

  const handleSearch = (e) => { setSearch(e.target.value); load(e.target.value, filter) }

  const handleFilter = (f) => { setFilter(f); load(search, f) }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await createProduct({ ...form, category: form.category || null })
      setShowForm(false)
      setForm({ name: '', sku: '', category: '', base_price: '', unit: 'pcs', description: '' })
      load(search, filter)
    } catch (err) {
      const detail = err.response?.data?.error?.detail || {}
      setFormError(Object.values(detail).flat().join(' ') || 'Failed to create product.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditClick = (p) => {
    setEditingProduct(p)
    setEditForm({ name: p.name, sku: p.sku, category: p.category || '', base_price: p.base_price, unit: p.unit, description: p.description || '' })
    setEditError('')
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    setEditSaving(true)
    setEditError('')
    try {
      await updateProduct(editingProduct.id, { ...editForm, category: editForm.category || null })
      setEditingProduct(null)
      load(search, filter)
    } catch (err) {
      const detail = err.response?.data?.error?.detail || {}
      setEditError(Object.values(detail).flat().join(' ') || 'Failed to update product.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleToggleActive = async (p) => {
    const action = p.is_active ? 'Deactivate' : 'Reactivate'
    if (!window.confirm(`${action} "${p.name}"?`)) return
    setActionError('')
    try {
      await updateProduct(p.id, { is_active: !p.is_active })
      load(search, filter)
    } catch (err) {
      setActionError(err.response?.data?.error?.message || `Failed to ${action.toLowerCase()} product.`)
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
        <h2 className="text-2xl font-bold">Products</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {editingProduct && (
        <div className="card">
          <h3 className="font-semibold mb-4">Edit Product</h3>
          <form onSubmit={handleEditSave} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input required maxLength={255} className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input required maxLength={50} className="input" value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price *</label>
              <input required type="number" min="0" step="0.01" className="input" value={editForm.base_price} onChange={(e) => setEditForm({ ...editForm, base_price: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select className="input" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}>
                {['pcs','kg','g','l','ml','box','pack','dozen'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input className="input" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            {editError && <p className="col-span-2 text-sm text-red-600">{editError}</p>}
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingProduct(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={editSaving} className="btn-primary">{editSaving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="card">
          <h3 className="font-semibold mb-4">New Product</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input required maxLength={255} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input required maxLength={50} className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price *</label>
              <input required type="number" min="0" step="0.01" className="input" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {['pcs','kg','g','l','ml','box','pack','dozen'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
        <input type="search" placeholder="Search products…" className="input max-w-sm" value={search} onChange={handleSearch} />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {[['all','All'],['active','Active'],['inactive','Inactive']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => handleFilter(val)}
              className={`px-3 py-1.5 font-medium transition-colors ${filter === val ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-gray-400">Loading…</p> : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {['SKU', 'Name', 'Category', 'Base Price', 'Unit', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.category_name || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{Number(p.base_price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleEditClick(p)}
                      className="text-xs text-brand-600 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={`text-xs hover:underline ${p.is_active ? 'text-red-500' : 'text-brand-600'}`}
                    >
                      {p.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
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
