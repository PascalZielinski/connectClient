import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

let emojiPromise
function loadEmojis() {
  emojiPromise ??= import('emojibase-data/de/data.json').then((m) =>
    m.default
      .filter((e) => e.group !== undefined && e.group !== 2)
      .map((e) => ({
        emoji: e.emoji,
        label: e.label,
        order: e.order,
        text: [e.label, ...(e.tags ?? [])].join(' ').toLowerCase(),
      }))
      .sort((a, b) => a.order - b.order),
  )
  return emojiPromise
}

export default function EmojiPicker({ onSelect, onClose, anchorRef }) {
  const [emojis, setEmojis] = useState([])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const rootRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    loadEmojis().then(setEmojis)
    searchRef.current?.focus()
  }, [])

  // Klick außerhalb / Escape schließt (Klick auf den Button selbst ignorieren,
  // sonst schließt der Outside-Click und der Button-Toggle öffnet sofort wieder)
  useEffect(() => {
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return emojis
    return emojis.filter((e) => e.text.includes(q)).slice(0, 200)
  }, [emojis, deferredQuery])

  return (
    <div className="emoji-picker" role="dialog" aria-label="Emoji picker" ref={rootRef}>
      <input
        ref={searchRef}
        className="emoji-picker-search"
        type="search"
        placeholder="Emoji suchen…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="emoji-picker-grid">
        {emojis.length === 0 ? (
          <p className="emoji-picker-empty">Lade…</p>
        ) : results.length === 0 ? (
          <p className="emoji-picker-empty">Nichts gefunden.</p>
        ) : (
          results.map((e) => (
            <button
              key={e.order}
              type="button"
              className="emoji-picker-item"
              title={e.label}
              onClick={() => onSelect(e.emoji)}
            >
              {e.emoji}
            </button>
          ))
        )}
      </div>
    </div>
  )
}