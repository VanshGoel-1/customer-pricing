import '@testing-library/jest-dom'

// Suppress React Router v6 future flag warnings in tests
const originalWarn = console.warn
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning')) return
  originalWarn(...args)
}
