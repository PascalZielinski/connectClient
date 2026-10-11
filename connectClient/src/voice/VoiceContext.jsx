import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../api/client.js'
import muteNotification from '../assets/sounds/universfield-new-notification-035-485894.mp3'
import callNotification from '../assets/sounds/universfield-system-notification-02-352442.mp3'

const VoiceContext = createContext(null)
const INPUT_DEVICE_KEY = 'connect.audioInputDevice'
const OUTPUT_DEVICE_KEY = 'connect.audioOutputDevice'
const OUTPUT_ENABLED_KEY = 'connect.audioOutputEnabled'
const AUDIO_SETTINGS_KEY = 'connect.audioSettings'

function storedValue(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function storedHeadphoneVolume() {
  try {
    const settings = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || '{}')
    return typeof settings.headVol === 'number'
      ? Math.min(1, Math.max(0, settings.headVol))
      : 1
  } catch {
    return 1
  }
}

function storedNoiseSuppression() {
  try {
    const settings = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || '{}')
    return typeof settings.noiseSuppression === 'boolean' ? settings.noiseSuppression : true
  } catch {
    return true
  }
}

// setVolume wirkt standardmäßig nur auf das Mikrofon, der Stream-Ton ist eine eigene Quelle
function applyVolume(participant, volume) {
  participant.setVolume(volume)
  participant.setVolume(volume, 'screen_share_audio')
}

export function VoiceProvider({ children }) {
  const roomRef = useRef(null)
  const cleanupAudioRef = useRef(() => {})
  const requestIdRef = useRef(0)
  const audioContainerRef = useRef(null)
  const muteNotificationRef = useRef(null)
  const voiceConnectedRef = useRef(false)
  const [participants, setParticipants] = useState([])
  const [status, setStatus] = useState('disconnected')
  const [error, setError] = useState('')
  const [screenShares, setScreenShares] = useState([])
  const [isSharing, setIsSharing] = useState(false)
  const [outputEnabled, setOutputEnabled] = useState(() => storedValue(OUTPUT_ENABLED_KEY, 'true') !== 'false')
  const [microphoneEnabled, setMicrophoneEnabled] = useState(() => storedValue(OUTPUT_ENABLED_KEY, 'true') !== 'false')
  const [microphoneBusy, setMicrophoneBusy] = useState(false)
  const [microphoneActive, setMicrophoneActive] = useState(false)
  const [headphoneVolume, setHeadphoneVolumeState] = useState(storedHeadphoneVolume)
  const [noiseSuppression, setNoiseSuppressionState] = useState(storedNoiseSuppression)
  const [inputDevices, setInputDevices] = useState([])
  const [outputDevices, setOutputDevices] = useState([])
  const [inputDeviceId, setInputDeviceId] = useState(() => storedValue(INPUT_DEVICE_KEY))
  const [outputDeviceId, setOutputDeviceId] = useState(() => storedValue(OUTPUT_DEVICE_KEY))
  const [deviceError, setDeviceError] = useState('')
  const preferencesRef = useRef(null)
  preferencesRef.current = {
    inputDeviceId,
    microphoneEnabled,
    noiseSuppression,
    outputDeviceId,
    outputEnabled,
    headphoneVolume,
  }
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

  const playCallNotification = useCallback(() => {
    const audio = new Audio(callNotification)
    audio.play().catch((playError) => {
      setError(playError.message || 'Could not play the voice call notification.')
    })
  }, [])

  const joinVoice = useCallback(async (channelUuid) => {
    const requestId = ++requestIdRef.current
    const previousRoom = roomRef.current
    const wasConnected = voiceConnectedRef.current
    voiceConnectedRef.current = false
    roomRef.current = null
    cleanupAudioRef.current()
    cleanupAudioRef.current = () => {}
    previousRoom?.disconnect()
    if (wasConnected) playCallNotification()
    setParticipants([])
    setScreenShares([])
    setIsSharing(false)
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
    const participantConnected = () => {
      updateParticipants()
      playCallNotification()
    }
    const participantDisconnected = () => {
      updateParticipants()
      playCallNotification()
    }
    const attachAudio = (track, publication, participant) => {
      if (track.kind !== 'audio') return
      applyVolume(
        participant,
        preferencesRef.current.outputEnabled ? preferencesRef.current.headphoneVolume : 0,
      )
      const element = track.attach()
      element.autoplay = true
      audioContainerRef.current?.appendChild(element)
      attachedTracks.add(track)
    }
    const trackSubscribed = (track, publication, participant) => {
      if (track.kind === 'video') {
        if (track.source !== 'screen_share') return
        setScreenShares((prev) => [
          ...prev.filter((share) => share.sid !== track.sid),
          { sid: track.sid, track, identity: participant.identity, name: participant.name },
        ])
        return
      }
      attachAudio(track, publication, participant)
    }
    const trackUnsubscribed = (track) => {
      if (track.kind === 'video') {
        setScreenShares((prev) => prev.filter((share) => share.sid !== track.sid))
        return
      }
      detachAudio(track)
    }
    const updateLocalShareState = () => {
      setIsSharing(nextRoom?.localParticipant.isScreenShareEnabled ?? false)
    }
    const updateActiveSpeakers = (speakers) => {
      setMicrophoneActive(
        preferencesRef.current.microphoneEnabled
          && speakers.some((speaker) => speaker === nextRoom.localParticipant),
      )
    }
    const disconnected = () => {
      if (requestId !== requestIdRef.current) return
      const wasVoiceConnected = voiceConnectedRef.current
      voiceConnectedRef.current = false
      cleanupAudioRef.current()
      roomRef.current = null
      setParticipants([])
      setScreenShares([])
      setIsSharing(false)
      setMicrophoneActive(false)
      setStatus('disconnected')
      if (wasVoiceConnected) playCallNotification()
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
      nextRoom = new livekit.Room({
        audioCaptureDefaults: {
          noiseSuppression: preferencesRef.current.noiseSuppression,
          voiceIsolation: false,
        },
      })
      roomRef.current = nextRoom
      nextRoom
        .on(events.TrackSubscribed, trackSubscribed)
        .on(events.TrackUnsubscribed, trackUnsubscribed)
        .on(events.ParticipantConnected, participantConnected)
        .on(events.ParticipantDisconnected, participantDisconnected)
        .on(events.ActiveSpeakersChanged, updateActiveSpeakers)
        .on(events.LocalTrackPublished, updateLocalShareState)
        .on(events.LocalTrackUnpublished, updateLocalShareState)
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
        voiceConnectedRef.current = true
        setStatus('connected')
        playCallNotification()
        await refreshDevices()
      }
    } catch (connectError) {
      if (requestId !== requestIdRef.current) return
      if (nextRoom) {
        nextRoom.off(events.TrackSubscribed, trackSubscribed)
        nextRoom.off(events.TrackUnsubscribed, trackUnsubscribed)
        nextRoom.off(events.ParticipantConnected, participantConnected)
        nextRoom.off(events.ParticipantDisconnected, participantDisconnected)
        nextRoom.off(events.ActiveSpeakersChanged, updateActiveSpeakers)
        nextRoom.off(events.LocalTrackPublished, updateLocalShareState)
        nextRoom.off(events.LocalTrackUnpublished, updateLocalShareState)
        nextRoom.off(events.Disconnected, disconnected)
        attachedTracks.forEach(detachAudio)
        nextRoom.disconnect()
        if (roomRef.current === nextRoom) roomRef.current = null
      }
      setScreenShares([])
      setIsSharing(false)
      setStatus('error')
      setError(connectError.message || 'Could not connect to the voice channel.')
    }
  }, [refreshDevices, playCallNotification])

  const leaveVoice = useCallback(() => {
    const wasConnected = voiceConnectedRef.current
    voiceConnectedRef.current = false
    requestIdRef.current += 1
    const currentRoom = roomRef.current
    roomRef.current = null
    cleanupAudioRef.current()
    cleanupAudioRef.current = () => {}
    currentRoom?.disconnect()
    setParticipants([])
    setScreenShares([])
    setIsSharing(false)
    setMicrophoneActive(false)
    setMicrophoneBusy(false)
    setStatus('disconnected')
    if (wasConnected) playCallNotification()
  }, [playCallNotification])

  const startScreenShare = useCallback(async ({ resolution, audio } = {}) => {
    const currentRoom = roomRef.current
    if (!currentRoom) return
    setError('')
    try {
      await currentRoom.localParticipant.setScreenShareEnabled(true, { audio, resolution })
    } catch (shareError) {
      // NotAllowedError = Picker abgebrochen, kein echter Fehler
      if (shareError?.name !== 'NotAllowedError') {
        setError(shareError.message || 'Could not start screen share.')
      }
    }
  }, [])

  const stopScreenShare = useCallback(async () => {
    try {
      await roomRef.current?.localParticipant.setScreenShareEnabled(false)
    } catch (shareError) {
      setError(shareError.message || 'Could not stop screen share.')
    }
  }, [])

  const updateMicrophoneEnabled = useCallback((enabled) => {
    setMicrophoneEnabled(enabled)
    preferencesRef.current = { ...preferencesRef.current, microphoneEnabled: enabled }
    if (!enabled) setMicrophoneActive(false)
  }, [])

  const applyMicrophoneEnabled = useCallback(async (enabled) => {
    const currentRoom = roomRef.current
    if (!currentRoom) {
      updateMicrophoneEnabled(enabled)
      return true
    }
    setMicrophoneBusy(true)
    setError('')
    try {
      await currentRoom.localParticipant.setMicrophoneEnabled(enabled)
      updateMicrophoneEnabled(enabled)
      return true
    } catch (microphoneError) {
      setError(microphoneError.message || 'Could not change microphone settings.')
      return false
    } finally {
      setMicrophoneBusy(false)
    }
  }, [updateMicrophoneEnabled])

  const updateOutputEnabled = useCallback((enabled) => {
    setOutputEnabled(enabled)
    preferencesRef.current = { ...preferencesRef.current, outputEnabled: enabled }
    try {
      localStorage.setItem(OUTPUT_ENABLED_KEY, String(enabled))
    } catch (storageError) {
      setDeviceError(storageError.message || 'Could not save audio output settings.')
    }
    roomRef.current?.remoteParticipants.forEach((participant) => {
      applyVolume(participant, enabled ? preferencesRef.current.headphoneVolume : 0)
    })
  }, [])

  const playMuteNotification = useCallback(() => {
    if (!muteNotificationRef.current) muteNotificationRef.current = new Audio(muteNotification)
    muteNotificationRef.current.currentTime = 0
    muteNotificationRef.current.play().catch((playError) => {
      setError(playError.message || 'Could not play the audio notification.')
    })
  }, [])

  const toggleMicrophone = useCallback(async () => {
    const nextEnabled = !microphoneEnabled
    if (!await applyMicrophoneEnabled(nextEnabled)) return
    if (nextEnabled && !outputEnabled) updateOutputEnabled(true)
    playMuteNotification()
  }, [microphoneEnabled, outputEnabled, applyMicrophoneEnabled, updateOutputEnabled, playMuteNotification])

  const toggleOutput = useCallback(async () => {
    const nextEnabled = !outputEnabled
    if (!await applyMicrophoneEnabled(nextEnabled)) return
    updateOutputEnabled(nextEnabled)
    playMuteNotification()
  }, [outputEnabled, applyMicrophoneEnabled, updateOutputEnabled, playMuteNotification])

  const setHeadphoneVolume = useCallback((volume) => {
    const nextVolume = Math.min(1, Math.max(0, volume))
    setHeadphoneVolumeState(nextVolume)
    roomRef.current?.remoteParticipants.forEach((participant) => {
      applyVolume(participant, preferencesRef.current.outputEnabled ? nextVolume : 0)
    })
  }, [])

  const setNoiseSuppression = useCallback(async (enabled) => {
    preferencesRef.current = { ...preferencesRef.current, noiseSuppression: enabled }
    setNoiseSuppressionState(enabled)
    const microphoneTrack = roomRef.current
      ?.localParticipant
      .getTrackPublication('microphone')
      ?.track
      ?.mediaStreamTrack
    if (!microphoneTrack) return
    try {
      await microphoneTrack.applyConstraints({ noiseSuppression: enabled, voiceIsolation: false })
    } catch (suppressionError) {
      setDeviceError(suppressionError.message || 'Could not change noise suppression.')
      throw suppressionError
    }
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
    screenShares,
    isSharing,
    microphoneEnabled,
    microphoneBusy,
    microphoneActive,
    outputEnabled,
    headphoneVolume,
    noiseSuppression,
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    deviceError,
    setAudioContainerElement,
    joinVoice,
    leaveVoice,
    startScreenShare,
    stopScreenShare,
    toggleMicrophone,
    toggleOutput,
    setHeadphoneVolume,
    setNoiseSuppression,
    selectInputDevice,
    selectOutputDevice,
    refreshDevices,
    requestDeviceAccess,
  }), [
    participants, status, error, screenShares, isSharing,
    microphoneEnabled, microphoneBusy, microphoneActive, outputEnabled,
    headphoneVolume, noiseSuppression,
    inputDevices, outputDevices, inputDeviceId, outputDeviceId, deviceError, setAudioContainerElement,
    joinVoice, leaveVoice, startScreenShare, stopScreenShare,
    toggleMicrophone, toggleOutput, setHeadphoneVolume, setNoiseSuppression,
    selectInputDevice, selectOutputDevice,
    refreshDevices, requestDeviceAccess,
  ])

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) throw new Error('useVoice must be used within a VoiceProvider.')
  return context
}