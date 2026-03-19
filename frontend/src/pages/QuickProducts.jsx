/**
 * Quick Products management page — manager/admin only.
 * Curate the list of product cards shown on the New Bill screen.
 */
import { useEffect, useState } from 'react'
import { getProducts } from '../api/products'
import { addQuickProduct, getQuickProductsManage, removeQuickProduct } from '../api/products'

export default function QuickProducts() {
  const [quickList, setQuickList]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [allProducts, setAllProducts] = useState([])
  const [search, setSearch]           = useState('')
  const [adding, setAdding]           = useState(false)
  const [addError, setAddError]       = useState(null)
  const [removingId, setRemovingId]   = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getQuickProductsManage()
      setQuickList(res.data.results || res.data.data || [])
    } catch {
      setError('Failed to load quick products.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!search.trim()) { setAllProducts([]); return }
    getProducts({ search: search.trim(), is_active: true, page_size: 10 })
      .then(({ data }) => setAllProducts(data.results || []))
      .catch(() => setAllProducts([]))
  }, [search])

  const quickProductIds = new Set(quickList.map((q) => q.id))

  const handleAdd = async (product) => {
    setAdding(true)
    setAddError(null)
    try {
      await addQuickProduct({ product: product.id, sort_order: quickList.length })
      setSearch('')
      setAllProducts([])
      await load()
    } catch (err) {
      setAddError(err.response?.data?.error?.message || 'Failed to add product.')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (quickId) => {
    setRemovingId(quickId)
    try {
      await removeQuickProduct(quickId)
      await load()
    } catch {
      // ignore — reload anyway
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Quick Products</h2>
        <p className="text-sm text-gray-500 mt-1">
          These product cards appear on the billing screen for fast item entry. Max 20.
        </p>
      </div>

      {/* Add product */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-700">Add to quick list</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search product by name or SKU…"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={quickList.length >= 20}
          />
          {quickList.length >= 20 && (
            <p className="text-xs text-amber-600 mt-1">Quick list is full (20/20). Remove an item first.</p>
          )}

          {allProducts.length > 0 && (
            <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {allProducts.map((p) => {
                const alreadyAdded = quickProductIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={alreadyAdded || adding}
                    onClick={() => handleAdd(p)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-left
                               border-b border-gray-100 last:border-0
                               hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku} · {p.unit} · ₹{Number(p.base_price).toFixed(2)}</p>
                    </div>
                    {alreadyAdded
                      ? <span className="text-xs text-green-600 font-medium">Already added</span>
                      : <span className="text-xs text-brand-600 font-medium">+ Add</span>
                    }
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
      </div>

      {/* Current quick list */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700">Current quick products</h3>
          <span className="text-sm text-gray-400">{quickList.length} / 20</span>
        </div>

        {loading ? (
          <p className="text-center py-10 text-gray-400">Loading…</p>
        ) : error ? (
          <p className="text-center py-10 text-red-500">{error}</p>
        ) : quickList.length === 0 ? (
          <p className="text-center py-10 text-gray-400">No quick products yet. Add some above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'SKU', 'Unit', 'Price', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quickList.map((q) => (
                <tr key={q.quick_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{q.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{q.sku}</td>
                  <td className="px-4 py-3 text-gray-500">{q.unit}</td>
                  <td className="px-4 py-3 font-semibold text-brand-600">₹{Number(q.base_price).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(q.quick_id)}
                      disabled={removingId === q.quick_id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {removingId === q.quick_id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
