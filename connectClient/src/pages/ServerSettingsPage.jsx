import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { serverName, unwrapServer } from '../api/servers.js'
import './ServerSettingsPage.css'

// Banner presets (UI only for now – not sent to the backend)
const BANNERS = [
  { id: 'black', label: 'Black', css: 'linear-gradient(180deg, #050505 0%, #3a3a3d 100%)' },
  { id: 'pink', label: 'Pink', css: 'linear-gradient(180deg, #ff0a91 0%, #ff7ad0 100%)' },
  { id: 'red', label: 'Red', css: 'linear-gradient(180deg, #dc1f1f 0%, #ff6a5c 100%)' },
  { id: 'orange', label: 'Orange', css: 'linear-gradient(180deg, #e8751a 0%, #ffb066 100%)' },
  { id: 'yellow', label: 'Yellow', css: 'linear-gradient(180deg, #e3bf26 0%, #fff08a 100%)' },
  { id: 'purple', label: 'Purple', css: 'linear-gradient(180deg, #7a3f9e 0%, #b273d6 100%)' },
  { id: 'blue', label: 'Blue', css: 'linear-gradient(180deg, #0a8ff0 0%, #66d3ff 100%)' },
  { id: 'teal', label: 'Teal', css: 'linear-gradient(180deg, #3dd9b8 0%, #a8f7f2 100%)' },
  { id: 'green', label: 'Green', css: 'linear-gradient(180deg, #365f0c 0%, #6c9b2b 100%)' },
  { id: 'gray', label: 'Gray', css: 'linear-gradient(180deg, #262628 0%, #707073 100%)' },
]

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"
      />
    </svg>
  )
}

function ServerSettingsPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const { refreshServers } = useAuth()
  const [server, setServer] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', publicy: false })
  const [initial, setInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const fileInputRef = useRef(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const imageUrlRef = useRef(null)
  const [banner, setBanner] = useState(0)

  const dirty =
    initial !== null &&
    (form.name !== initial.name ||
      form.description !== initial.description ||
      form.publicy !== initial.publicy)

  useEffect(() => {
    let active = true
    apiRequest(`/servers/${uuid}`)
      .then((data) => {
        if (!active) return
        const loaded = unwrapServer(data)
        const settings = loaded.settings || loaded
        const values = {
          name: settings.name || '',
          description: settings.description || '',
          publicy: Boolean(settings.publicy),
        }
        setServer(loaded)
        setForm(values)
        setInitial(values)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load server settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [uuid])

  useEffect(() => {
    if (loading) return undefined
    let active = true

    apiRequest(`/servers/${uuid}/image`, { responseType: 'blob' })
      .then((blob) => {
        if (!active) return
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
        const objectUrl = URL.createObjectURL(blob)
        imageUrlRef.current = objectUrl
        setImageUrl(objectUrl)
      })
      .catch((imageError) => {
        if (!active || imageError.status === 404) return
        setError(imageError.message || 'Could not load the server picture.')
      })

    return () => { active = false }
  }, [loading, uuid, imageVersion])

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  // ESC closes the page (unless there are unsaved changes)
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !dirty) navigate(`/servers/${uuid}`)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirty, navigate, uuid])

  function updateField(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function handleReset() {
    if (initial) setForm(initial)
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg']
    if (!allowedTypes.includes(file.type)) {
      setError('Only PNG and JPEG files are allowed.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large (max 10 MB).')
      return
    }

    setUploading(true)
    setError('')
    setFeedback('')
    try {
      const body = new FormData()
      body.append('image', file, file.name || 'server.jpg')
      await apiRequest(`/servers/${uuid}/image`, { method: 'POST', body })

      setImageVersion((v) => v + 1)
      window.dispatchEvent(new Event('server-changed'))
      setFeedback('Server picture updated.')
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the image.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFeedback('')
    const trimmed = {
      name: form.name.trim(),
      description: form.description.trim(),
      publicy: form.publicy,
    }
    try {
      const updated = await apiRequest(`/servers/${uuid}`, {
        method: 'PATCH',
        body: JSON.stringify(trimmed),
      })
      setServer(unwrapServer(updated || { ...server, settings: form }))
      setForm(trimmed)
      setInitial(trimmed)
      await refreshServers()
      setFeedback('Server settings saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save server settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${serverName(server)}"? This cannot be undone.`)) return
    setError('')
    try {
      await apiRequest(`/servers/${uuid}`, { method: 'DELETE' })
      await refreshServers()
      navigate('/', { replace: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this server.')
    }
  }

  if (loading) {
    return (
      <section className="ss-root">
        <p className="ss-loading">Loading settings…</p>
      </section>
    )
  }

  const displayName = form.name.trim() || (server ? serverName(server) : 'Server')
  const initialLetter = displayName.charAt(0).toUpperCase()

  return (
    <section className="ss-root">
      {/* ───────── Sidebar ───────── */}
      <aside className="ss-sidebar-region">
        <nav className="ss-sidebar" aria-label="Server settings">
          <div className="ss-nav-group">
            <span className="ss-nav-heading">{displayName}</span>
            <button type="button" className="ss-nav-item is-active" aria-current="page">
              Server profile
            </button>
          </div>

          <div className="ss-nav-group">
            <span className="ss-nav-heading">People</span>
            <button type="button" className="ss-nav-item" disabled>Members</button>
            <button type="button" className="ss-nav-item" disabled>Roles</button>
            <button type="button" className="ss-nav-item" disabled>Invites</button>
          </div>

          <div className="ss-nav-group">
            <button type="button" className="ss-nav-item ss-nav-danger" onClick={handleDelete}>
              <span>Delete server</span>
              <TrashIcon />
            </button>
          </div>
        </nav>
      </aside>

      {/* ───────── Main content ───────── */}
      <main className="ss-main">
        <div className="ss-main-inner">
          <form className="ss-form" onSubmit={handleSave}>
            <span className="ss-kicker">SERVER CONTROL</span>
            <h1 className="ss-title">
              {server ? `Settings for ${serverName(server)}` : 'Server settings'}
            </h1>
            <p className="ss-intro">Shape how your community looks and who can find it.</p>

            {error && <p className="ss-alert ss-alert-error" role="alert">{error}</p>}
            {feedback && <p className="ss-alert ss-alert-success" role="status">{feedback}</p>}

            <div className="ss-section">
              <label className="ss-label" htmlFor="settings-name">Server name</label>
              <input
                id="settings-name"
                className="ss-input"
                name="name"
                value={form.name}
                onChange={updateField}
                maxLength={100}
                required
              />
            </div>

            <div className="ss-section">
              <span className="ss-label" id="settings-picture-label">Server picture</span>
              <p className="ss-hint">We recommend an image of at least 512x512 px. PNG or JPEG, max 10 MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={onFileChange}
                hidden
              />
              <div className="ss-picture-row">
                {imageUrl && (
                  <img
                    className="ss-picture"
                    src={imageUrl}
                    alt="Server picture"
                    width={72}
                    height={72}
                  />
                )}
                <button
                  className="ss-btn ss-btn-primary"
                  type="button"
                  aria-labelledby="settings-picture-label"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Change picture'}
                </button>
              </div>
            </div>

            <div className="ss-section">
              <label className="ss-label" htmlFor="settings-description">Description</label>
              <textarea
                id="settings-description"
                className="ss-input ss-textarea"
                name="description"
                value={form.description}
                onChange={updateField}
                rows={4}
                maxLength={500}
              />
              <span className="ss-counter">{form.description.length}/500</span>
            </div>

            <div className="ss-section">
              <label className="ss-switch-row settings-public-toggle">
                <span className="ss-switch-text">
                  <span className="ss-label">Make this server public</span>
                  <span className="ss-hint">Public servers can be found by other people.</span>
                </span>
                <input
                  className="ss-switch"
                  name="publicy"
                  type="checkbox"
                  checked={form.publicy}
                  onChange={updateField}
                />
              </label>
            </div>

            {/* Unsaved changes bar */}
            {dirty && (
              <div className="ss-savebar" role="region" aria-label="Unsaved changes">
                <span>Careful — you have unsaved changes!</span>
                <div className="ss-savebar-actions">
                  <button className="ss-btn ss-btn-text" type="button" onClick={handleReset} disabled={saving}>
                    Reset
                  </button>
                  <button className="ss-btn ss-btn-success" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>

      {/* ───────── Close (ESC) ───────── */}
      <div className="ss-close-region">
        <Link className="ss-close" to={`/servers/${uuid}`} aria-label="Back to server">
          <CloseIcon />
        </Link>
        <span className="ss-close-hint" aria-hidden="true">ESC</span>
      </div>
    </section>
  )
}

export default ServerSettingsPage