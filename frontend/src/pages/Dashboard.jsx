import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCustomers } from '../api/customers'
import { getOrders } from '../api/orders'
import { getProducts } from '../api/products'
import { useAuth } from '../context/AuthContext'
import OrderDetailModal from '../components/OrderDetailModal'

function StatCard({ label, value, sub, to, color }) {
  const card = (
    <div className={`card border-l-4 ${color} hover:shadow-md transition-shadow`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

export default function Dashboard() {
  const { user, isManager } = useAuth()
  const [stats, setStats] = useState({})
  const [recentOrders, setRecentOrders] = useState([])
  const [detailOrderId, setDetailOrderId] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [ordersRes] = await Promise.all([
          getOrders({ page_size: 5 }),
        ])
        setRecentOrders(ordersRes.data.results || [])

        if (isManager) {
          const [custRes, prodRes, allOrders] = await Promise.all([
            getCustomers({ page_size: 1, is_active: true }),
            getProducts({ page_size: 1, is_active: true }),
            getOrders({ page_size: 1 }),
          ])
          setStats({
            customers: custRes.data.count,
            products: prodRes.data.count,
            orders: allOrders.data.count,
          })
        }
      } catch {
        // ignore — stats are best-effort
      }
    }
    load()
  }, [isManager])

  const statusColor = {
    draft: 'bg-gray-100 text-gray-600',
    confirmed: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h2>
        <p className="text-gray-500 text-sm mt-1">Here's what's happening today.</p>
      </div>

      {isManager && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Active Customers" value={stats.customers} to="/customers?filter=active" color="border-brand-500" />
          <StatCard label="Active Products" value={stats.products} to="/products?filter=active" color="border-green-500" />
          <StatCard label="Total Orders" value={stats.orders} to="/orders" color="border-purple-500" />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Orders</h3>
          <Link to="/bill" className="btn-primary text-xs px-3 py-1.5">+ New Bill</Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <p className="text-lg">No orders yet</p>
            <Link to="/bill" className="btn-primary mt-4 inline-flex">Create first bill</Link>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Order #', 'Customer', 'Total', 'Status', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetailOrderId(o.id)}>
                    <td className="px-4 py-3 font-mono font-medium text-brand-600">{o.order_number}</td>
                    <td className="px-4 py-3">{o.customer_name}</td>
                    <td className="px-4 py-3 font-medium">
                      {Number(o.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${statusColor[o.status] || 'bg-gray-100 text-gray-600'}`}>
                        {o.status_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailModal orderId={detailOrderId} onClose={() => setDetailOrderId(null)} />
    </div>
  )
}
