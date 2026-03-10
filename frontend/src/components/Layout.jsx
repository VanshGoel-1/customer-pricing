import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* Top header bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-4 sticky top-0 z-20">
          <span className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{user?.name}</span>
            <span className="ml-1 capitalize text-gray-400">({user?.role})</span>
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </header>
        <main className="flex-1 p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}
