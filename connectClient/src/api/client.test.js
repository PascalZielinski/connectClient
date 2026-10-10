import assert from 'node:assert/strict'
import test from 'node:test'
import { apiPost, apiRequest, getTokens, refreshSession, saveTokens } from './client.js'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage

function useMemoryStorage() {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.localStorage = originalStorage
})

test('public login sends credentials without an existing bearer token', async () => {
  useMemoryStorage()
  saveTokens({ token: 'old-access', refresh_token: 'old-refresh' })
  let authorization
  globalThis.fetch = async (_url, options) => {
    authorization = new Headers(options.headers).get('Authorization')
    return Response.json({
      token: 'new-access',
      refresh_token: 'new-refresh',
      user: { uuid: 'user-1' },
    })
  }

  const result = await apiPost('/login', { email: 'user@example.test', password: 'password' }, {
    skipAuth: true,
    skipRefresh: true,
  })

  assert.equal(authorization, null)
  assert.equal(result.token, 'new-access')
})

test('an expired access token is refreshed and retried with the rotated token pair', async () => {
  useMemoryStorage()
  saveTokens({ token: 'expired-access', refresh_token: 'single-use-refresh' })
  const requests = []
  globalThis.fetch = async (url, options) => {
    const headers = new Headers(options.headers)
    requests.push({ url, options, authorization: headers.get('Authorization') })

    if (url === '/api/token/refresh') {
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'single-use-refresh' })
      return Response.json({ token: 'fresh-access', refresh_token: 'rotated-refresh' })
    }
    if (requests.length === 1) return Response.json({ detail: 'Expired' }, { status: 401 })
    return Response.json({ user: { uuid: 'user-1' } })
  }

  const result = await apiRequest('/me')

  assert.deepEqual(result, { user: { uuid: 'user-1' } })
  assert.equal(requests[0].authorization, 'Bearer expired-access')
  assert.equal(requests[2].authorization, 'Bearer fresh-access')
  assert.deepEqual(getTokens(), {
    accessToken: 'fresh-access',
    refreshToken: 'rotated-refresh',
  })
})

test('a refresh token can restore a session without an access token', async () => {
  useMemoryStorage()
  localStorage.setItem('connect.refreshToken', 'refresh-only')
  let requestUrl
  globalThis.fetch = async (url, options) => {
    requestUrl = url
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { refresh_token: 'refresh-only' })
    return Response.json({ token: 'restored-access', refresh_token: 'restored-refresh' })
  }

  await refreshSession()

  assert.equal(requestUrl, '/api/token/refresh')
  assert.deepEqual(getTokens(), {
    accessToken: 'restored-access',
    refreshToken: 'restored-refresh',
  })
})

test('multipart requests preserve FormData so fetch can set its boundary', async () => {
  useMemoryStorage()
  const formData = new FormData()
  formData.append('content', 'A file')
  formData.append('file', new Blob(['contents']), 'file.txt')
  let requestOptions
  globalThis.fetch = async (_url, options) => {
    requestOptions = options
    return Response.json({ uuid: 'message-1' })
  }

  await apiRequest('/channels/channel-1/messages', { method: 'POST', body: formData })

  assert.equal(requestOptions.body, formData)
  assert.equal(new Headers(requestOptions.headers).has('Content-Type'), false)
})

test('blob requests return the download body', async () => {
  useMemoryStorage()
  globalThis.fetch = async () => new Response('downloaded contents', { status: 200 })

  const result = await apiRequest('/channels/channel-1/attachments/attachment-1', {
    responseType: 'blob',
  })

  assert.equal(await result.text(), 'downloaded contents')
})
