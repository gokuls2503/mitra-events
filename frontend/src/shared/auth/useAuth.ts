import { createContext, useContext } from 'react'

import type { AuthUser, Role } from './roles'

export interface AuthState {
  user: AuthUser | null
  /** True until the initial silent refresh has finished. */
  loading: boolean
  /** True after a deliberate logout, so the next login doesn't return to the previous user's page. */
  loggedOut: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
