import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'

async function cropToBlob(src, { x, y, width, height }, size = 512) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(img, x, y, width, height, 0, 0, size, size)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

export default function AvatarCropper({ src, onDone, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)

  const onCropComplete = useCallback((_, pixels) => setArea(pixels), [])

  async function save() {
    if (!area) return
    onDone(await cropToBlob(src, area))
  }

  return (
    <>
      <div style={{ position: 'relative', width: 300, height: 300 }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <button type="button" onClick={save}>Speichern</button>
      <button type="button" onClick={onCancel}>Abbrechen</button>
    </>
  )
}