import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client.js'

function ServerAvatar({ uuid, fallback, version = 0 }) {
  const [imageUrl, setImageUrl] = useState(null)
  const imageUrlRef = useRef(null)

  useEffect(() => {
    if (!uuid) return undefined
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
        if (!active || imageError.status !== 404) return
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = null
        setImageUrl(null)
      })

    return () => { active = false }
  }, [uuid, version])

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  if (imageUrl) return <img src={imageUrl} alt="" />
  return <span>{fallback}</span>
}

export default ServerAvatar