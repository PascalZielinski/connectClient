const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
const ACCESS_TOKEN_KEY = 'connect.accessToken'
const REFRESH_TOKEN_KEY = 'connect.refreshToken'

let refreshRequest

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getTokens() {
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  }
}

export function saveTokens(tokens) {
  if (tokens.token) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.token)
  if (tokens.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

async function readResponse(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(body, status) {
  if (typeof body === 'string' && body) return body
  return body?.detail || body?.message || body?.error || `Request failed (${status}).`
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const { refreshToken } = getTokens()
      if (!refreshToken) throw new ApiError('Your session has expired. Please sign in again.', 401)

      const response = await fetch(`${API_BASE_URL}/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const body = await readResponse(response)
      if (!response.ok || !body?.token) {
        clearTokens()
        throw new ApiError(errorMessage(body, response.status), response.status)
      }
      saveTokens(body)
      return body.token
    })().finally(() => {
      refreshRequest = undefined
    })
  }

  return refreshRequest
}

export async function apiRequest(path, options = {}) {
  const { accessToken } = getTokens()
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  let response = await fetch(url, { ...options, headers })
  let body = await readResponse(response)

  if (response.status === 401 && accessToken && !options.skipRefresh) {
    try {
      const refreshedToken = await refreshAccessToken()
      headers.set('Authorization', `Bearer ${refreshedToken}`)
      response = await fetch(url, { ...options, headers })
      body = await readResponse(response)
    } catch (error) {
      clearTokens()
      window.dispatchEvent(new Event('connect:unauthorized'))
      throw error
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearTokens()
      window.dispatchEvent(new Event('connect:unauthorized'))
    }
    throw new ApiError(errorMessage(body, response.status), response.status)
  }
  return body
}

export function apiPost(path, data) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify(data) })
}
