import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { FullPageSpinner } from '@/shared/ui/Spinner'

import { useAuth } from './useAuth'
import type { Role } from './roles'

interface Props {
  children: ReactNode
  /** If given, the user must have one of these roles. */
  roles?: Role[]
}

export function RequireAuth({ children, roles }: Props) {
  const { user, loading, loggedOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/admin/login" replace state={loggedOut ? null : { from: location.pathname }} />
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-3xl text-brand-800">No access</h1>
        <p className="mt-2 text-stone-600">Your role doesn't have permission to view this page.</p>
      </div>
    )
  }
  return <>{children}</>
}
