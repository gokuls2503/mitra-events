import { ListChecks, Plus } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'

import type { Booking } from '../crm/api'
import { FormError } from '../kit'
import { ops, useOpsMutation, useTasks } from '../ops/api'
import { TaskForm, TaskItem } from '../ops/TaskItem'

export function EventTasksSection({ booking }: { booking: Booking }) {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const canAdd = hasRole('OWNER', 'MANAGER', 'STAFF')
  const { data } = useTasks({ booking: booking.id, page_size: 200, ordering: 'due_date' })
  const checklist = useOpsMutation(ops.standardChecklist)
  const [adding, setAdding] = useState(false)

  const tasks = data?.results ?? []
  const done = tasks.filter((t) => t.status === 'DONE').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <ListChecks className="size-4 text-stone-400" />
        <h2 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Tasks</h2>
        {tasks.length > 0 && (
          <span className="text-xs text-stone-500">
            {done}/{tasks.length} done
          </span>
        )}
        <div className="ml-auto flex gap-2 print:hidden">
          {isManager && (
            <Button
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              loading={checklist.isPending}
              onClick={() => checklist.mutate(booking.id)}
              title="Adds the usual prep tasks, dated back from the event day"
            >
              Add standard checklist
            </Button>
          )}
          {canAdd && (
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> Task
            </Button>
          )}
        </div>
      </header>
      {tasks.length > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {checklist.data && <p className="mb-2 text-xs text-stone-500">{checklist.data.created ? `Added ${checklist.data.created} tasks.` : 'The standard checklist is already on this event.'}</p>}
      <FormError error={checklist.error} />
      {tasks.length === 0 && <p className="text-sm text-stone-500">No tasks yet.</p>}
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} showEvent={false} />
        ))}
      </ul>
      <Modal wide open={adding} title={`Add task — ${booking.title}`} onClose={() => setAdding(false)}>
        {adding && <TaskForm bookingId={booking.id} onDone={() => setAdding(false)} />}
      </Modal>
    </section>
  )
}
