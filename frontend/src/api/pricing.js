import client from './client'

export const lookupPrice = (customerId, productId) =>
  client.get('/pricing/lookup/', { params: { customer_id: customerId, product_id: productId } })

export const setCustomerPrice = (data) => client.post('/pricing/set-price/', data)

export const getCustomerPricelist = (customerId) =>
  client.get(`/pricing/pricelist/${customerId}/`)

export const getPriceHistory = (params) =>
  client.get('/pricing/history/', { params })
