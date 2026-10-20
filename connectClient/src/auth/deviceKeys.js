const DB_NAME = 'connect-device'
const DB_VERSION = 1
const STORE = 'device'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function idbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
}

export async function exportPublicKeyPem(publicKey) {
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  const bytes = new Uint8Array(spki)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  const b64 = btoa(binary)
  const lines = b64.match(/.{1,64}/g).join('\n')
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`
}

function storageKey(email) {
  return `device:${email.toLowerCase()}`
}

export async function loadDevice(email) {
  return (await idbGet(storageKey(email))) || {}
}

export async function saveDevice(email, device) {
  await idbPut(storageKey(email), device)
}

export function defaultDeviceName() {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS Device'
  if (/android/.test(ua)) return 'Android Device'
  if (/mac os|macintosh/.test(ua)) return 'macOS Device'
  if (/windows/.test(ua)) return 'Windows Device'
  if (/linux/.test(ua)) return 'Linux Device'
  return 'Browser Device'
}