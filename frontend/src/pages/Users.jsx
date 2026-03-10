import { useEffect, useState } from 'react'
import client from '../api/client'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'cashier', password: '', password_confirm: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await client.get('/users/')
      setUsers(data.results || data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await client.post('/users/', form)
      setShowForm(false)
      setForm({ name: '', email: '', role: 'cashier', password: '', password_confirm: '' })
      load()
    } catch (err) {
      const detail = err.response?.data?.error?.detail || {}
      setFormError(Object.values(detail).flat().join(' ') || 'Failed to create user.')
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (u) => {
    if (!confirm(`Deactivate "${u.name}"?`)) return
    await client.delete(`/users/${u.id}/`)
    load()
  }

  const roleColor = { admin: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', cashier: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Users</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="font-semibold mb-4">New User</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input required maxLength={150} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input required type="email" maxLength={254} className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input required type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input required type="password" className="input" value={form.password_confirm} onChange={(e) => setForm({ ...form, password_confirm: e.target.value })} />
            </div>
            {formError && <p className="col-span-2 text-sm text-red-600">{formError}</p>}
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create User'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <p className="text-gray-400">Loading…</p> : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200"><tr>
              {['Name', 'Email', 'Role', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3"><span className={`badge ${roleColor[u.role]}`}>{u.role}</span></td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active && (
                      <button onClick={() => handleDeactivate(u)} className="text-xs text-red-500 hover:underline">
                        Deactivate
                      </button>
                    )}
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
