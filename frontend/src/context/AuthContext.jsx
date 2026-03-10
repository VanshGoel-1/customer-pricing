import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react' // useRef kept for lastActivityTime
import { login as apiLogin, logout as apiLogout } from '../api/auth'

const AuthContext = createContext(null)

// Auto-logout after 15 minutes of inactivity
const IDLE_TIMEOUT_MS = 15 * 60 * 1000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'))
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)
  const lastActivityTime = useRef(Date.now())

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem('refresh')
      if (refresh) await apiLogout(refresh)
    } catch {
      // ignore — tokens may already be expired
    } finally {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      localStorage.removeItem('user')
      setUser(null)
    }
  }, [])

  // Start/stop idle watcher whenever login state changes
  useEffect(() => {
    if (!user) return

    lastActivityTime.current = Date.now()

    // Reset last-activity timestamp on any user interaction
    const onActivity = () => { lastActivityTime.current = Date.now() }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    // Poll every 60 s — reliable even when browser throttles setTimeout
    const interval = setInterval(() => {
      if (Date.now() - lastActivityTime.current >= IDLE_TIMEOUT_MS) logout()
    }, 60_000)

    // Also fire immediately when the tab becomes visible (catches device sleep)
    const onVisible = () => {
      if (document.visibilityState === 'visible' &&
          Date.now() - lastActivityTime.current >= IDLE_TIMEOUT_MS) {
        logout()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, logout])

  const login = useCallback(async (email, password) => {
    setLoading(true)
    try {
      const { data } = await apiLogin(email, password)
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      return data.user
    } finally {
      setLoading(false)
    }
  }, [])

  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager' || user?.role === 'admin'
  const isCashier = user?.role === 'cashier'

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isManager, isCashier }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
