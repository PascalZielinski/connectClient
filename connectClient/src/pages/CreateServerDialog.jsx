import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './CreateServerDialog.css'

function CreateServerDialog({ onClose, onCreate }) {
  const nameInputRef = useRef(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [publicy, setPublicy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    nameInputRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        publicy,
      })
    } catch (createError) {
      setError(createError.message || 'Could not create the server.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="create-server-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section className="create-server-dialog" role="dialog" aria-modal="true" aria-labelledby="create-server-title">
        <div className="create-server-dialog-header">
          <h2 id="create-server-title">Create a server</h2>
          <button
            className="create-server-close"
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>
        <form className="create-server-dialog-form" onSubmit={handleSubmit}>
          <label htmlFor="new-server-name">Name</label>
          <input
            ref={nameInputRef}
            id="new-server-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Server name"
            maxLength={100}
            required
          />
          <label htmlFor="new-server-description">Description <span>Optional</span></label>
          <textarea
            id="new-server-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A short description"
            rows={3}
            maxLength={500}
          />
          <label className="create-server-public">
            <input type="checkbox" checked={publicy} onChange={(event) => setPublicy(event.target.checked)} />
            <span>Public server</span>
          </label>
          {error && <p className="create-server-error" role="alert">{error}</p>}
          <div className="create-server-dialog-actions">
            <button className="create-server-cancel" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create server'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default CreateServerDialog
