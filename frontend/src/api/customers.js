import client from './client'

export const getCustomers = (params) => client.get('/customers/', { params })
export const getCustomer = (id) => client.get(`/customers/${id}/`)
export const createCustomer = (data) => client.post('/customers/', data)
export const updateCustomer = (id, data) => client.patch(`/customers/${id}/`, data)
export const deleteCustomer = (id) => client.delete(`/customers/${id}/`)
export const lookupByPhone = (phone) =>
  client.get('/customers/lookup/', { params: { phone } })

export const getCustomerLedger = (customerId) =>
  client.get(`/customers/${customerId}/ledger/`)
export const postLedgerEntry = (customerId, data) =>
  client.post(`/customers/${customerId}/ledger/`, data)
