import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

/**
 * The access token lives only in memory. The refresh token is an httpOnly cookie
 * set by Django, so on a 401 we call /auth/refresh/ once and retry.
 */
let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Several requests can 401 at once; they all wait on the same refresh call.
let refreshing: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  refreshing ??= axios
    .post<{ access: string }>('/api/v1/auth/refresh/', null, { withCredentials: true })
    .then((res) => {
      setAccessToken(res.data.access)
      return res.data.access
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined
    const isAuthCall = original?.url?.startsWith('/auth/')
    if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
      throw error
    }
    original._retried = true
    try {
      await refreshAccessToken()
    } catch {
      setAccessToken(null)
      onSessionExpired?.()
      throw error
    }
    return api(original)
  },
)

/** Turns a DRF error response into one readable message. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!axios.isAxiosError(error)) return fallback
  const data = error.response?.data as Record<string, unknown> | string[] | undefined
  if (!data) return error.message || fallback
  if (Array.isArray(data)) return String(data[0])
  if (typeof data.detail === 'string') return data.detail
  const first = Object.entries(data)[0]
  if (!first) return fallback
  const [field, value] = first
  const msg = Array.isArray(value) ? value[0] : value
  return field === 'non_field_errors' ? String(msg) : `${field}: ${msg}`
}
