import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiPost, apiRequest, clearTokens, getTokens, refreshSession, saveTokens } from '../api/client.js'
import { serverList } from '../api/servers.js'
import {
  defaultDeviceName,
  exportPublicKeyPem,
  generateKeyPair,
  loadDevice,
  saveDevice,
} from './deviceKeys.js'

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

  const ensureDeviceRegistered = useCallback(async (email) => {
    const device = await loadDevice(email)

    // 1) Keypair anlegen, falls lokal noch keines existiert
    if (!device.privateKey || !device.publicKeyPem) {
      const keyPair = await generateKeyPair()
      device.privateKey = keyPair.privateKey
      device.publicKeyPem = await exportPublicKeyPem(keyPair.publicKey)
      await saveDevice(email, device)
    }

    // 2) Server-Registrierung nachholen, falls deviceUuid fehlt
    if (!device.deviceUuid) {
      const result = await apiPost('/trusted/device', {
        deviceName: defaultDeviceName(),
        publicKey: device.publicKeyPem,
      })
      if (!result?.deviceUuid) {
        throw new Error('The server did not return a device UUID.')
      }
      device.deviceUuid = result.deviceUuid
      await saveDevice(email, device)
    }

    return device
  }, [])

  const authenticate = useCallback(async (endpoint, credentials) => {
    setStatus('checking')
    setError('')
    setServersError('')

    const email = credentials.email

    try {
      // Vor dem Login: vorhandene Device-UUID mitsenden, damit der
      // Backend-Listener das Gerät prüfen kann.
      const { deviceUuid: existingUuid } = await loadDevice(email)

      const tokenResponse = await apiPost(endpoint, credentials, {
        skipAuth: true,
        skipRefresh: true,
        headers: existingUuid ? { 'X-Device-Id': existingUuid } : {},
      })
      if (!tokenResponse?.token || !tokenResponse?.refresh_token) {
        throw new Error('The server did not return both access and refresh tokens.')
      }
      saveTokens(tokenResponse)

      const account = await apiRequest('/me')
      setUser(account?.user || account)

      // Nach dem Login: Gerät registrieren, falls noch nicht geschehen.
      // Fehler blockieren den Login NICHT – beim nächsten Login wird
      // der Schritt automatisch wiederholt.
      try {
        await ensureDeviceRegistered(email)
      } catch (deviceError) {
        console.warn('Device registration failed, will retry on next login:', deviceError)
      }

      setStatus('authenticated')
      setError('')
      loadServers().catch(() => {})
    } catch (authError) {
      clearTokens()
      setUser(null)
      setServers([])
      setStatus('unauthenticated')
      throw authError
    }
  }, [loadServers, ensureDeviceRegistered])

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