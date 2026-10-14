import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { serverName, unwrapServer } from '../api/servers.js'
import './ServerPage.css'

function ServerSettingsPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const { refreshServers } = useAuth()
  const [server, setServer] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', publicy: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const fileInputRef = useRef(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const imageUrlRef = useRef(null)

  useEffect(() => {
    let active = true
    apiRequest(`/servers/${uuid}`)
      .then((data) => {
        if (!active) return
        const loaded = unwrapServer(data)
        const settings = loaded.settings || loaded
        setServer(loaded)
        setForm({
          name: settings.name || '',
          description: settings.description || '',
          publicy: Boolean(settings.publicy),
        })
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

  function updateField(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
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
    try {
      const updated = await apiRequest(`/servers/${uuid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          publicy: form.publicy,
        }),
      })
      setServer(unwrapServer(updated || { ...server, settings: form }))
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

  if (loading) return <section className="server-page"><p className="server-loading">Loading settings…</p></section>

  return (
    <section className="server-page server-settings-page">
      <Link className="server-back-link" to={`/servers/${uuid}`}>← Back to server</Link>
      <span className="section-kicker">SERVER CONTROL</span>
      <h1>{server ? `Settings for ${serverName(server)}` : 'Server settings'}</h1>
      <p className="server-page-intro">Shape how your community looks and who can find it.</p>
      {error && <p className="server-error" role="alert">{error}</p>}
      {feedback && <p className="server-success" role="status">{feedback}</p>}
      <form className="server-settings-form" onSubmit={handleSave}>
        <label htmlFor="settings-name">Server name</label>
        <input id="settings-name" name="name" value={form.name} onChange={updateField} maxLength={100} required />

        <label>Server picture</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={onFileChange}
          hidden
        />
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Server picture"
            width={96}
            height={96}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <button
          className="Upload-Button"
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Change picture'}
        </button>

        <label htmlFor="settings-description">Description</label>
        <textarea
          id="settings-description"
          name="description"
          value={form.description}
          onChange={updateField}
          rows={4}
          maxLength={500}
        />
        <label className="settings-public-toggle">
          <input name="publicy" type="checkbox" checked={form.publicy} onChange={updateField} />
          <span>Make this server public</span>
        </label>
        <div className="settings-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="danger-button" type="button" onClick={handleDelete}>Delete server</button>
        </div>
      </form>
    </section>
  )
}

export default ServerSettingsPage