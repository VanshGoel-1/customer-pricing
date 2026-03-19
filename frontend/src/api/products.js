import client from './client'

export const getProducts = (params) => client.get('/products/', { params })
export const getProduct = (id) => client.get(`/products/${id}/`)
export const createProduct = (data) => client.post('/products/', data)
export const updateProduct = (id, data) => client.patch(`/products/${id}/`, data)
export const deleteProduct = (id) => client.delete(`/products/${id}/`)

export const getCategories = () => client.get('/products/categories/')
export const createCategory = (data) => client.post('/products/categories/', data)

export const getQuickProducts       = ()       => client.get('/products/quick/')
export const getQuickProductsManage = ()       => client.get('/products/quick/manage/')
export const addQuickProduct        = (data)   => client.post('/products/quick/manage/', data)
export const removeQuickProduct     = (id)     => client.delete(`/products/quick/manage/${id}/`)
