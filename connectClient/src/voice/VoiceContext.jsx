import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../api/client.js'

const VoiceContext = createContext(null)
const INPUT_DEVICE_KEY = 'connect.audioInputDevice'
const OUTPUT_DEVICE_KEY = 'connect.audioOutputDevice'
const OUTPUT_ENABLED_KEY = 'connect.audioOutputEnabled'

function storedValue(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function VoiceProvider({ children }) {
  const roomRef = useRef(null)
  const cleanupAudioRef = useRef(() => {})
  const requestIdRef = useRef(0)
  const audioContainerRef = useRef(null)
  const [participants, setParticipants] = useState([])
  const [status, setStatus] = useState('disconnected')
  const [error, setError] = useState('')
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [microphoneBusy, setMicrophoneBusy] = useState(false)
  const [microphoneActive, setMicrophoneActive] = useState(false)
  const [outputEnabled, setOutputEnabled] = useState(() => storedValue(OUTPUT_ENABLED_KEY, 'true') !== 'false')
  const [inputDevices, setInputDevices] = useState([])
  const [outputDevices, setOutputDevices] = useState([])
  const [inputDeviceId, setInputDeviceId] = useState(() => storedValue(INPUT_DEVICE_KEY))
  const [outputDeviceId, setOutputDeviceId] = useState(() => storedValue(OUTPUT_DEVICE_KEY))
  const [deviceError, setDeviceError] = useState('')
  const preferencesRef = useRef(null)
  preferencesRef.current = { inputDeviceId, microphoneEnabled, outputDeviceId, outputEnabled }
  const setAudioContainerElement = useCallback((element) => {
    audioContainerRef.current = element
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceError('This device does not support audio device selection.')
      return
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter((device) => device.kind === 'audioinput'))
      setOutputDevices(devices.filter((device) => device.kind === 'audiooutput'))
    } catch (enumerateError) {
      setDeviceError(enumerateError.message || 'Could not list audio devices.')
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    if (!navigator.mediaDevices?.addEventListener) return undefined
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const requestDeviceAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceError('This device does not support microphone access.')
      return
    }
    let stream
    try {
      setDeviceError('')
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      await refreshDevices()
    } catch (permissionError) {
      setDeviceError(permissionError.message || 'Microphone permission was denied.')
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [refreshDevices])

  const joinVoice = useCallback(async (channelUuid) => {
    const requestId = ++requestIdRef.current
    const previousRoom = roomRef.current
    roomRef.current = null
    cleanupAudioRef.current()
    cleanupAudioRef.current = () => {}
    previousRoom?.disconnect()
    setParticipants([])
    setMicrophoneActive(false)
    setStatus('connecting')
    setError('')

    let nextRoom
    let events
    const attachedTracks = new Set()
    const detachAudio = (track) => {
      if (!attachedTracks.has(track)) return
      track.detach().forEach((element) => element.remove())
      attachedTracks.delete(track)
    }
    cleanupAudioRef.current = () => attachedTracks.forEach(detachAudio)
    const updateParticipants = () => {
      setParticipants(Array.from(nextRoom.remoteParticipants.values(), (participant) => participant.identity))
    }
    const attachAudio = (track, publication, participant) => {
      if (track.kind !== 'audio') return
      participant.setVolume(preferencesRef.current.outputEnabled ? 1 : 0)
      const element = track.attach()
      element.autoplay = true
      audioContainerRef.current?.appendChild(element)
      attachedTracks.add(track)
    }
    const updateActiveSpeakers = (speakers) => {
      setMicrophoneActive(
        preferencesRef.current.microphoneEnabled
          && speakers.some((speaker) => speaker === nextRoom.localParticipant),
      )
    }
    const disconnected = () => {
      if (requestId !== requestIdRef.current) return
      cleanupAudioRef.current()
      roomRef.current = null
      setParticipants([])
      setMicrophoneActive(false)
      setStatus('disconnected')
    }

    try {
      if (!channelUuid) throw new Error('This voice channel does not include a channel UUID.')
      const livekit = await import('livekit-client')
      if (requestId !== requestIdRef.current) return

      const credentials = await apiRequest(
        `/voice/${encodeURIComponent(channelUuid)}/token`,
        { method: 'POST' },
      )
      if (typeof credentials?.token !== 'string' || typeof credentials?.url !== 'string') {
        throw new Error('The server did not return LiveKit connection details.')
      }
      if (requestId !== requestIdRef.current) return

      events = livekit.RoomEvent
      nextRoom = new livekit.Room()
      roomRef.current = nextRoom
      nextRoom
        .on(events.TrackSubscribed, attachAudio)
        .on(events.TrackUnsubscribed, detachAudio)
        .on(events.ParticipantConnected, updateParticipants)
        .on(events.ParticipantDisconnected, updateParticipants)
        .on(events.ActiveSpeakersChanged, updateActiveSpeakers)
        .on(events.Disconnected, disconnected)

      await nextRoom.connect(credentials.url, credentials.token)
      if (requestId !== requestIdRef.current) {
        nextRoom.disconnect()
        return
      }
      updateParticipants()
      const { inputDeviceId: inputId, microphoneEnabled: micEnabled, outputDeviceId: outputId } = preferencesRef.current
      if (outputId) {
        try {
          await nextRoom.switchActiveDevice('audiooutput', outputId)
        } catch (selectionError) {
          setDeviceError(selectionError.message || 'Could not select this audio output.')
        }
      }
      if (inputId) {
        try {
          await nextRoom.switchActiveDevice('audioinput', inputId)
        } catch (selectionError) {
          setDeviceError(selectionError.message || 'Could not select this microphone.')
        }
      }
      await nextRoom.localParticipant.setMicrophoneEnabled(micEnabled)
      if (requestId === requestIdRef.current) {
        setStatus('connected')
        await refreshDevices()
      }
    } catch (connectError) {
      if (requestId !== requestIdRef.current) return
      if (nextRoom) {
        nextRoom.off(events.TrackSubscribed, attachAudio)
        nextRoom.off(events.TrackUnsubscribed, detachAudio)
        nextRoom.off(events.ParticipantConnected, updateParticipants)
        nextRoom.off(events.ParticipantDisconnected, updateParticipants)
        nextRoom.off(events.ActiveSpeakersChanged, updateActiveSpeakers)
        nextRoom.off(events.Disconnected, disconnected)
        attachedTracks.forEach(detachAudio)
        nextRoom.disconnect()
        if (roomRef.current === nextRoom) roomRef.current = null
      }
      setStatus('error')
      setError(connectError.message || 'Could not connect to the voice channel.')
    }
  }, [refreshDevices])

  const leaveVoice = useCallback(() => {
    requestIdRef.current += 1
    const currentRoom = roomRef.current
    roomRef.current = null
    cleanupAudioRef.current()
    cleanupAudioRef.current = () => {}
    currentRoom?.disconnect()
    setParticipants([])
    setMicrophoneActive(false)
    setMicrophoneBusy(false)
    setStatus('disconnected')
  }, [])

  const toggleMicrophone = useCallback(async () => {
    const nextEnabled = !microphoneEnabled
    const currentRoom = roomRef.current
    if (!currentRoom) {
      setMicrophoneEnabled(nextEnabled)
      return
    }
    setMicrophoneBusy(true)
    setError('')
    try {
      await currentRoom.localParticipant.setMicrophoneEnabled(nextEnabled)
      setMicrophoneEnabled(nextEnabled)
      if (!nextEnabled) setMicrophoneActive(false)
    } catch (microphoneError) {
      setError(microphoneError.message || 'Could not change microphone settings.')
    } finally {
      setMicrophoneBusy(false)
    }
  }, [microphoneEnabled])

  const toggleOutput = useCallback(() => {
    setOutputEnabled((enabled) => {
      const nextEnabled = !enabled
      try {
        localStorage.setItem(OUTPUT_ENABLED_KEY, String(nextEnabled))
      } catch (storageError) {
        setDeviceError(storageError.message || 'Could not save audio output settings.')
      }
      roomRef.current?.remoteParticipants.forEach((participant) => {
        participant.setVolume(nextEnabled ? 1 : 0)
      })
      return nextEnabled
    })
  }, [])

  const selectInputDevice = useCallback(async (deviceId) => {
    setInputDeviceId(deviceId)
    setDeviceError('')
    try {
      localStorage.setItem(INPUT_DEVICE_KEY, deviceId)
      if (roomRef.current) await roomRef.current.switchActiveDevice('audioinput', deviceId || 'default')
    } catch (selectionError) {
      setDeviceError(selectionError.message || 'Could not select this microphone.')
    }
  }, [])

  const selectOutputDevice = useCallback(async (deviceId) => {
    setOutputDeviceId(deviceId)
    setDeviceError('')
    try {
      localStorage.setItem(OUTPUT_DEVICE_KEY, deviceId)
      if (roomRef.current) await roomRef.current.switchActiveDevice('audiooutput', deviceId || 'default')
    } catch (selectionError) {
      setDeviceError(selectionError.message || 'Could not select this audio output.')
    }
  }, [])

  const value = useMemo(() => ({
    participants,
    status,
    error,
    microphoneEnabled,
    microphoneBusy,
    microphoneActive,
    outputEnabled,
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    deviceError,
    setAudioContainerElement,
    joinVoice,
    leaveVoice,
    toggleMicrophone,
    toggleOutput,
    selectInputDevice,
    selectOutputDevice,
    refreshDevices,
    requestDeviceAccess,
  }), [
    participants, status, error, microphoneEnabled, microphoneBusy, microphoneActive, outputEnabled,
    inputDevices, outputDevices, inputDeviceId, outputDeviceId, deviceError, setAudioContainerElement,
    joinVoice, leaveVoice, toggleMicrophone, toggleOutput, selectInputDevice, selectOutputDevice,
    refreshDevices, requestDeviceAccess,
  ])

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) throw new Error('useVoice must be used within a VoiceProvider.')
  return context
}
