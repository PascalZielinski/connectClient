const API_BASE_URL = (import.meta.env?.VITE_API_URL || '/api').replace(/\/+$/, '')
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
  if (typeof tokens?.token !== 'string' || !tokens.token) {
    throw new Error('The server did not return an access token.')
  }
  if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) {
    throw new Error('The server did not return a refresh token.')
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.token)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
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

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('connect:unauthorized'))
  }
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const { refreshToken } = getTokens()
      if (!refreshToken) {
        throw new ApiError('Your session has expired. Please sign in again.', 401)
      }

      const response = await fetch(`${API_BASE_URL}/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const body = await readResponse(response)
      if (!response.ok) {
        clearTokens()
        throw new ApiError(errorMessage(body, response.status), response.status)
      }

      try {
        saveTokens(body)
      } catch (tokenError) {
        clearTokens()
        throw new ApiError(tokenError.message, response.status)
      }
      return body.token
    })().finally(() => {
      refreshRequest = undefined
    })
  }

  return refreshRequest
}

export async function refreshSession() {
  try {
    return await refreshAccessToken()
  } catch (refreshError) {
    clearTokens()
    notifyUnauthorized()
    throw refreshError
  }
}

export async function apiRequest(path, options = {}) {
  const { skipAuth = false, skipRefresh = false, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})
  if (fetchOptions.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  if (!skipAuth) {
    const { accessToken } = getTokens()
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  } else {
    headers.delete('Authorization')
  }

  let response = await fetch(url, { ...fetchOptions, headers })
  let body = await readResponse(response)

  if (response.status === 401 && !skipAuth && !skipRefresh) {
    try {
      const refreshedToken = await refreshAccessToken()
      headers.set('Authorization', `Bearer ${refreshedToken}`)
      response = await fetch(url, { ...fetchOptions, headers })
      body = await readResponse(response)
    } catch (refreshError) {
      clearTokens()
      notifyUnauthorized()
      throw refreshError
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      clearTokens()
      notifyUnauthorized()
    }
    throw new ApiError(errorMessage(body, response.status), response.status)
  }
  return body
}

export function apiPost(path, data, options = {}) {
  return apiRequest(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  })
}
