import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps a route that requires authentication.
 * optionally requires a specific role: 'admin' | 'manager'
 */
export default function ProtectedRoute({ children, requireRole }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  if (requireRole === 'admin' && user.role !== 'admin')
    return <Navigate to="/" replace />

  if (requireRole === 'manager' && !['manager', 'admin'].includes(user.role))
    return <Navigate to="/" replace />

  return children
}
