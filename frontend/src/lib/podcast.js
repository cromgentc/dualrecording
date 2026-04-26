export const AUTH_TOKEN_KEY = 'podcast-auth-token'
export const POLL_INTERVAL = 4000
export const SIGNAL_INTERVAL = 1200
export const HEARTBEAT_INTERVAL = 8000
export const RTC_CONFIGURATION = {
  // Public STUN helps peers discover network paths for WebRTC audio.
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export { API_BASE_URL, API_ENDPOINTS, apiRequest, buildApiUrl } from './api'

export function pickAudioMimeType() {
  // Browsers support different recorder containers, so choose the first available one.
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]

  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export function formatDate(value) {
  if (!value) {
    return 'Not yet'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatState(value) {
  // Backend recording states are mapped to user-friendly labels.
  return (
    {
      idle: 'Ready',
      recording: 'Recording live',
      stopped: 'Upload pending',
      ready: 'All tracks ready',
    }[value] || value
  )
}

export function absoluteUrl(relativeUrl) {
  return new URL(relativeUrl, window.location.origin).toString()
}

export async function copyText(value) {
  // Clipboard can fail on insecure origins or denied permissions.
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
