import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { api, apiErrorMessage } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/useAuth'
import { ROLE_LABELS, ROLES, type Role } from '@/shared/auth/roles'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { Spinner } from '@/shared/ui/Spinner'

interface StaffUser {
  id: number
  email: string
  full_name: string
  phone: string
  role: Role
  is_active: boolean
  last_login: string | null
}

interface Page<T> {
  count: number
  results: T[]
}

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))

export default function UsersPage() {
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<Page<StaffUser>>('/users/', { params: { page_size: 200 } })).data,
  })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-800">Users</h1>
          <p className="text-sm text-stone-600">Staff logins and their roles. Deactivate people who leave.</p>
        </div>
        <Button className="ml-auto" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Add user
        </Button>
      </div>

      {isLoading && <Spinner />}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.results.map((u) => (
                <tr key={u.id} className="cursor-pointer hover:bg-brand-50" onClick={() => setEditing(u)}>
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs',
                        u.is_active ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-600',
                      )}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Add user' : 'Edit user'} onClose={() => setEditing(null)}>
        {editing !== null && <UserForm user={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

function UserForm({ user, onDone }: { user: StaffUser | null; onDone: () => void }) {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  const isSelf = user?.id === me?.id

  const schema = z.object({
    full_name: z.string().min(1, 'Required'),
    email: z.email('Enter a valid email'),
    phone: z.string(),
    role: z.enum(ROLES),
    is_active: z.boolean(),
    password: user
      ? z.string().refine((v) => v === '' || v.length >= 8, 'At least 8 characters')
      : z.string().min(8, 'At least 8 characters'),
  })
  type Values = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'STAFF',
      is_active: user?.is_active ?? true,
      password: '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const payload: Partial<Values> = { ...values }
      if (!payload.password) delete payload.password
      return user ? api.patch(`/users/${user.id}/`, payload) : api.post('/users/', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onDone()
    },
  })

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
      <TextField label="Full name" error={errors.full_name?.message} {...register('full_name')} />
      <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
      <TextField label="Phone" type="tel" {...register('phone')} />
      <SelectField label="Role" options={roleOptions} disabled={isSelf} {...register('role')} />
      <TextField
        label={user ? 'New password' : 'Password'}
        type="password"
        autoComplete="new-password"
        hint={user ? 'Leave blank to keep the current password' : undefined}
        error={errors.password?.message}
        {...register('password')}
      />
      {user && !isSelf && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-700" {...register('is_active')} />
          Active (can log in)
        </label>
      )}
      {mutation.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{apiErrorMessage(mutation.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}
