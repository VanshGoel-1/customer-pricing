import client from './client'

export const getCashTransactions    = (params) => client.get('/cashbook/', { params })
export const getCashTransaction     = (id)     => client.get(`/cashbook/${id}/`)
export const createCashInTransaction  = (data) => client.post('/cashbook/in/',  data)
export const createCashOutTransaction = (data) => client.post('/cashbook/out/', data)
export const updateCashTransaction  = (id, data) => client.patch(`/cashbook/${id}/`, data)
export const deleteCashTransaction  = (id)     => client.delete(`/cashbook/${id}/`)
export const getCashbookSummary     = (params) => client.get('/cashbook/summary/', { params })
export const getCashbookCategories  = ()       => client.get('/cashbook/categories/')
