import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { api, apiErrorMessage } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/useAuth'
import { ROLE_LABELS } from '@/shared/auth/roles'
import { Button } from '@/shared/ui/Button'
import { TextField } from '@/shared/ui/Field'

const schema = z
  .object({
    current_password: z.string().min(1, 'Required'),
    new_password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Values = z.infer<typeof schema>

export default function ProfilePage() {
  const { user } = useAuth()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: (v: Values) =>
      api.post('/auth/change-password/', { current_password: v.current_password, new_password: v.new_password }),
    onSuccess: () => reset({ current_password: '', new_password: '', confirm: '' }),
  })

  if (!user) return null
  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-semibold text-brand-800">My profile</h1>
      <dl className="mt-4 mb-8 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        <dt className="text-stone-500">Name</dt>
        <dd>{user.full_name}</dd>
        <dt className="text-stone-500">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-stone-500">Role</dt>
        <dd>{ROLE_LABELS[user.role]}</dd>
      </dl>

      <h2 className="mb-3 font-sans text-lg font-semibold">Change password</h2>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          {...register('current_password')}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        {mutation.error && <p className="text-sm text-red-600">{apiErrorMessage(mutation.error)}</p>}
        {mutation.isSuccess && <p className="text-sm text-green-700">Password updated.</p>}
        <Button type="submit" loading={mutation.isPending}>
          Update password
        </Button>
      </form>
    </div>
  )
}
