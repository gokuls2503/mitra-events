import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { apiErrorMessage } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { TextField } from '@/shared/ui/Field'
import { FullPageSpinner } from '@/shared/ui/Spinner'

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (loading) return <FullPageSpinner />
  if (user) return <Navigate to={from} replace />

  async function onSubmit(values: FormValues) {
    setError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Login failed.'))
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-brand-800 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-center text-3xl font-semibold text-brand-800">Mitra Events</h1>
        <p className="mt-1 mb-6 text-center text-sm text-stone-500">Sign in to the admin</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
