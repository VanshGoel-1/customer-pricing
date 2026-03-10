import client from './client'

export const login = (email, password) =>
  client.post('/auth/login/', { email, password })

export const logout = (refresh) =>
  client.post('/auth/logout/', { refresh })

export const getMe = () => client.get('/users/me/')

export const changePassword = (data) =>
  client.post('/users/me/change-password/', data)
