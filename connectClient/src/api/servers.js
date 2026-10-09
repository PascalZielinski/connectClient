export function unwrapServer(server) {
  const value = server?.server || server || {}
  return {
    ...value,
    settings: value.settings || value,
  }
}

export function serverList(data) {
  if (Array.isArray(data)) return data.map(unwrapServer)
  const collection = data?.servers || data?.data || []
  return Array.isArray(collection) ? collection.map(unwrapServer) : []
}

export function serverName(server) {
  return unwrapServer(server).settings?.name || 'Untitled server'
}

export function serverUuid(server) {
  return unwrapServer(server).uuid
}

export function serverInitial(server) {
  return serverName(server).trim().charAt(0).toUpperCase() || 'S'
}
