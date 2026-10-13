import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '@/shared/api/client'

import type { AuthUser, Role } from './roles'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const queryClient = useQueryClient()

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    setSessionExpiredHandler(clearSession)
    refreshAccessToken()
      .then(() => api.get<AuthUser>('/auth/me/'))
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ access: string; user: AuthUser }>('/auth/login/', { email, password })
    setAccessToken(res.data.access)
    setLoggedOut(false)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/')
    } finally {
      setLoggedOut(true)
      clearSession()
    }
  }, [clearSession])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(
    () => ({ user, loading, loggedOut, login, logout, hasRole }),
    [user, loading, loggedOut, login, logout, hasRole],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
