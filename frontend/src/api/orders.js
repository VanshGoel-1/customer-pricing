import client from './client'

export const getOrders = (params) => client.get('/orders/', { params })
export const getOrder = (id) => client.get(`/orders/${id}/`)
export const createOrder = (data) => client.post('/orders/', data)
export const confirmOrder = (id) => client.post(`/orders/${id}/confirm/`)
export const markPaid = (id) => client.post(`/orders/${id}/mark-paid/`)
export const cancelOrder = (id) => client.post(`/orders/${id}/cancel/`)
export const recordPayment = (id, amount, mode = 'cash') => client.post(`/orders/${id}/payment/`, { amount, mode })
export const addOrderItem = (orderId, data) =>
  client.post(`/orders/${orderId}/items/`, data)
