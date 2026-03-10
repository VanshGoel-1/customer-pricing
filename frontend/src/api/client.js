/**
 * Axios instance with JWT attach + automatic token refresh.
 * On 401: attempts one silent refresh, retries the original request.
 * On refresh failure: clears tokens and redirects to /login.
 */
import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ─────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: silent refresh on 401 ──────────────────────────
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
  failedQueue = []
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`
            return client(original)
          })
          .catch((err) => Promise.reject(err))
      }

      original._retry = true
      isRefreshing = true

      const refresh = localStorage.getItem('refresh')
      if (!refresh) {
        isRefreshing = false
        _logout()
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post('/api/v1/auth/refresh/', { refresh })
        localStorage.setItem('access', data.access)
        if (data.refresh) localStorage.setItem('refresh', data.refresh)
        processQueue(null, data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return client(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        _logout()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

function _logout() {
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
  localStorage.removeItem('user')
  window.location.href = '/login'
}

export default client
