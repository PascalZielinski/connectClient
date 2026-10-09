import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiPost, apiRequest, clearTokens, getTokens, saveTokens } from '../api/client.js'
import { serverList } from '../api/servers.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [servers, setServers] = useState([])
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')

  const loadServers = useCallback(async () => {
    const data = await apiRequest('/me/servers')
    const ownServers = serverList(data)
    setServers(ownServers)
    return ownServers
  }, [])

  const loadAccount = useCallback(async () => {
    const account = await apiRequest('/me')
    setUser(account?.user || account)
    setStatus('authenticated')
    setError('')
    await loadServers()
  }, [loadServers])

  useEffect(() => {
    let active = true
    const { accessToken, refreshToken } = getTokens()

    if (!accessToken && !refreshToken) {
      setStatus('unauthenticated')
      return undefined
    }

    loadAccount().catch((loadError) => {
      if (!active) return
      if (loadError.status === 401) {
        clearTokens()
        setUser(null)
        setServers([])
        setStatus('unauthenticated')
      } else {
        setError(loadError.message || 'Could not connect to the server.')
        setStatus('error')
      }
    })

    return () => {
      active = false
    }
  }, [loadAccount])

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null)
      setServers([])
      setStatus('unauthenticated')
    }
    window.addEventListener('connect:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('connect:unauthorized', handleUnauthorized)
  }, [])

  const authenticate = useCallback(async (endpoint, credentials) => {
    const tokenResponse = await apiPost(endpoint, credentials)
    if (!tokenResponse?.token) {
      throw new Error('The server did not return an access token.')
    }
    saveTokens(tokenResponse)
    const account = tokenResponse.user || await apiRequest('/me')
    setUser(account?.user || account)
    setStatus('authenticated')
    setError('')
    await loadServers()
  }, [loadServers])

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
    setServers([])
    setStatus('unauthenticated')
  }, [])

  const refreshServers = useCallback(async () => {
    const updatedServers = await loadServers()
    return updatedServers
  }, [loadServers])

  const value = useMemo(() => ({
    user,
    servers,
    status,
    error,
    authenticate,
    logout,
    refreshServers,
    retry: () => {
      setStatus('checking')
      setError('')
      loadAccount().catch((loadError) => {
        setError(loadError.message || 'Could not connect to the server.')
        setStatus(loadError.status === 401 ? 'unauthenticated' : 'error')
      })
    },
  }), [user, servers, status, error, authenticate, logout, refreshServers, loadAccount])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider.')
  return context
}
