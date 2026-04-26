export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// Central list of API paths keeps pages from hard-coding route strings in new code.
export const API_ENDPOINTS = {
  auth: {
    me: '/api/auth/me',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    register: '/api/auth/register',
    forgotRequest: '/api/auth/forgot/request',
    forgotVerify: '/api/auth/forgot/verify',
    forgotReset: '/api/auth/forgot/reset',
  },
  sessions: {
    list: '/api/sessions',
    create: '/api/sessions',
    byId: (sessionId) => `/api/sessions/${sessionId}`,
    join: (sessionId) => `/api/sessions/${sessionId}/participants/join`,
    ping: (sessionId) => `/api/sessions/${sessionId}/participants/ping`,
    signals: (sessionId) => `/api/sessions/${sessionId}/signals`,
    recordings: (sessionId) => `/api/sessions/${sessionId}/recordings`,
  },
}

export function buildApiUrl(path) {
  // Local dev can use Vite proxy paths; deployed builds can prepend VITE_API_URL.
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  if (!API_BASE_URL) {
    return path
  }

  return path.startsWith('/') ? `${API_BASE_URL}${path}` : `${API_BASE_URL}/${path}`
}

export async function apiRequest(path, options = {}) {
  // Add auth and JSON headers automatically while still allowing per-call overrides.
  const response = await fetch(buildApiUrl(path), {
    headers: {
      ...(options.authToken
        ? { Authorization: `Bearer ${options.authToken}` }
        : {}),
      ...(options.body && !(options.body instanceof Blob)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.error || 'Request failed.'
    throw new Error(message)
  }

  return payload
}
