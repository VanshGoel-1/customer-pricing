import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import Cashbook from './pages/Cashbook'
import CustomerProfile from './pages/CustomerProfile'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import NewBill from './pages/NewBill'
import Orders from './pages/Orders'
import PriceHistory from './pages/PriceHistory'
import Products from './pages/Products'
import Users from './pages/Users'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* All authenticated routes share the Layout */}
      <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/bill" element={<ProtectedRoute><Layout><NewBill /></Layout></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><Layout><Orders /></Layout></ProtectedRoute>} />
      <Route path="/cashbook" element={<ProtectedRoute><Layout><Cashbook /></Layout></ProtectedRoute>} />

      {/* Manager + Admin only */}
      <Route path="/customers" element={<ProtectedRoute requireRole="manager"><Layout><Customers /></Layout></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute requireRole="manager"><Layout><CustomerProfile /></Layout></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute requireRole="manager"><Layout><Products /></Layout></ProtectedRoute>} />
      <Route path="/price-history" element={<ProtectedRoute requireRole="manager"><Layout><PriceHistory /></Layout></ProtectedRoute>} />

      {/* Admin only */}
      <Route path="/users" element={<ProtectedRoute requireRole="admin"><Layout><Users /></Layout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
