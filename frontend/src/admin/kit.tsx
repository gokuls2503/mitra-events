import { isAxiosError } from 'axios'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { apiErrorMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'

export function TabHeader({ title, intro, onAdd, addLabel }: { title: string; intro: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div>
        <h2 className="font-sans text-lg font-semibold text-stone-900">{title}</h2>
        <p className="text-sm text-stone-600">{intro}</p>
      </div>
      {onAdd && (
        <Button className="ml-auto" onClick={onAdd}>
          <Plus className="size-4" /> {addLabel ?? 'Add'}
        </Button>
      )}
    </div>
  )
}

export function Published({ on, labels = ['Published', 'Hidden'] }: { on: boolean; labels?: [string, string] }) {
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-xs', on ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-600')}>
      {on ? labels[0] : labels[1]}
    </span>
  )
}

export function QueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <Spinner />
  if (isAxiosError(error) && error.response?.status === 404) {
    return <p className="text-stone-600">This record doesn't exist, or it isn't assigned to you.</p>
  }
  if (error) return <p className="text-red-600">{apiErrorMessage(error)}</p>
  return null
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{apiErrorMessage(error)}</p>
}

/** Two-step delete: no browser confirm() dialogs. */
export function DeleteButton({ onDelete, pending }: { onDelete: () => void; pending?: boolean }) {
  const [armed, setArmed] = useState(false)
  if (!armed)
    return (
      <Button type="button" variant="ghost" className="text-red-600" onClick={() => setArmed(true)}>
        Delete
      </Button>
    )
  return (
    <span className="flex items-center gap-2 text-sm">
      Delete permanently?
      <Button type="button" variant="danger" loading={pending} onClick={onDelete}>
        Yes, delete
      </Button>
      <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
        No
      </Button>
    </span>
  )
}

export function FormActions({ onCancel, pending, extra }: { onCancel: () => void; pending: boolean; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-4">
      <div className="mr-auto">{extra}</div>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </div>
  )
}

export const TABLE = 'w-full text-left text-sm'
export const THEAD = 'bg-stone-50 text-xs text-stone-500 uppercase'
export const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-stone-200 bg-white'

export function Pagination({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (pages <= 1) return <p className="mt-3 text-xs text-stone-500">{count} total</p>
  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      <span className="text-xs text-stone-500">
        {count} total · page {page} of {pages}
      </span>
      <Button variant="secondary" className="ml-auto px-3 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button variant="secondary" className="px-3 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">{children}</p>
}
