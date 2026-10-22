import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiPost, apiRequest, clearTokens, getTokens, refreshSession, saveTokens } from '../api/client.js'
import { serverList } from '../api/servers.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [servers, setServers] = useState([])
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')
  const [serversError, setServersError] = useState('')

  const loadServers = useCallback(async () => {
    setServersError('')
    try {
      const data = await apiRequest('/me/servers')
      const ownServers = serverList(data)
      setServers(ownServers)
      return ownServers
    } catch (loadError) {
      setServersError(loadError.message || 'Could not load your servers.')
      throw loadError
    }
  }, [])

  const loadAccount = useCallback(async () => {
    const account = await apiRequest('/me')
    setUser(account?.user || account)
    setStatus('authenticated')
    setError('')
    loadServers().catch(() => {})
  }, [loadServers])

  useEffect(() => {
    let active = true
    const { accessToken, refreshToken } = getTokens()

    if (!accessToken && !refreshToken) {
      setStatus('unauthenticated')
      return undefined
    }

    async function restoreSession() {
      try {
        if (!accessToken && refreshToken) await refreshSession()
        await loadAccount()
      } catch (loadError) {
        if (!active) return
        clearTokens()
        setUser(null)
        setServers([])
        setStatus('unauthenticated')
        setError(loadError.message || 'Your session has expired. Please sign in again.')
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [loadAccount])

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null)
      setServers([])
      setStatus('unauthenticated')
      setError('')
    }
    window.addEventListener('connect:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('connect:unauthorized', handleUnauthorized)
  }, [])

  const authenticate = useCallback(async (endpoint, credentials, deviceSecret) => {
    setStatus('checking')
    setError('')
    setServersError('')

    try {
      const options = { skipAuth: true, skipRefresh: true }

      if (deviceSecret) {
        options.headers = { 'X-Device-Secret': deviceSecret }
      }

      const response = await apiPost(endpoint, credentials, options)

      if (response?.status === 'device_verification_required') {
        setStatus('unauthenticated')
        return { deviceVerificationRequired: true, message: response.message }
      }

      if (!response?.token || !response?.refresh_token) {
        throw new Error('The server did not return both access and refresh tokens.')
      }
      saveTokens(response)

      const account = await apiRequest('/me')
      setUser(account?.user || account)
      setStatus('authenticated')
      setError('')
      loadServers().catch(() => {})

      return { deviceVerificationRequired: false }
    } catch (authError) {
      clearTokens()
      setUser(null)
      setServers([])
      setStatus('unauthenticated')
      throw authError
    }
  }, [loadServers])

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
    setServers([])
    setServersError('')
    setError('')
    setStatus('unauthenticated')
  }, [])

  const refreshServers = useCallback(async () => {
    const updatedServers = await loadServers()
    return updatedServers
  }, [loadServers])

  const retry = useCallback(async () => {
    setStatus('checking')
    setError('')
    try {
      const { accessToken, refreshToken } = getTokens()
      if (!accessToken && refreshToken) await refreshSession()
      await loadAccount()
    } catch (loadError) {
      clearTokens()
      setUser(null)
      setServers([])
      setStatus('unauthenticated')
      setError(loadError.message || 'Your session has expired. Please sign in again.')
    }
  }, [loadAccount])

  const value = useMemo(() => ({
    user,
    servers,
    status,
    error,
    serversError,
    authenticate,
    logout,
    refreshServers,
    retry,
  }), [user, servers, status, error, serversError, authenticate, logout, refreshServers, retry])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider.')
  return context
}