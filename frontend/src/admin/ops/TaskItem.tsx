import clsx from 'clsx'
import { CalendarDays, Flag } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { daysUntil, fmtShortDate } from '@/shared/dates'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field'
import { DateField } from '@/shared/ui/DateField'
import { Modal } from '@/shared/ui/Modal'

import { useBookings, useTeam } from '../crm/api'
import { DeleteButton, FormError } from '../kit'
import { ops, TASK_PRIORITIES, useOpsMutation, type Task } from './api'

const PRIORITY_STYLE: Record<number, string> = {
  4: 'text-red-600',
  3: 'text-orange-600',
  2: 'text-stone-400',
  1: 'text-stone-300',
}

/** One task row: tick to complete, click the title to edit. */
export function TaskItem({ task, showEvent = true }: { task: Task; showEvent?: boolean }) {
  const { user, hasRole } = useAuth()
  const [editing, setEditing] = useState(false)
  const toggle = useOpsMutation(ops.saveTask)
  const done = task.status === 'DONE'
  const canWrite = hasRole('OWNER', 'MANAGER') || (hasRole('STAFF') && task.assigned_to === user?.id)
  const days = task.due_date ? daysUntil(task.due_date) : null
  const overdue = !done && days !== null && days < 0

  return (
    <li className={clsx('flex items-start gap-3 rounded-lg border bg-white px-3 py-2.5', overdue ? 'border-red-200' : 'border-stone-200')}>
      <input
        type="checkbox"
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        checked={done}
        disabled={!canWrite || toggle.isPending}
        onChange={() => toggle.mutate({ id: task.id, status: done ? 'TODO' : 'DONE' })}
        className="mt-0.5 size-4 shrink-0 accent-brand-700"
      />
      <div className="min-w-0 flex-1 text-sm">
        <button
          onClick={() => canWrite && setEditing(true)}
          className={clsx('text-left', done ? 'text-stone-400 line-through' : 'text-stone-900', canWrite && 'hover:text-brand-700')}
        >
          {task.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
          {task.due_date && (
            <span className={clsx('flex items-center gap-1', overdue && 'font-medium text-red-600')}>
              <CalendarDays className="size-3" />
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtShortDate(task.due_date)}
              {overdue && ` (${-days!}d late)`}
            </span>
          )}
          {task.priority >= 3 && !done && (
            <span className={clsx('flex items-center gap-1', PRIORITY_STYLE[task.priority])}>
              <Flag className="size-3" /> {task.priority_label}
            </span>
          )}
          {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
          {showEvent && task.booking_detail && (
            <Link to={`/admin/events/${task.booking_detail.id}`} className="text-brand-700 hover:underline">
              {task.booking_detail.title}
            </Link>
          )}
          {done && task.completed_by_name && <span>✓ {task.completed_by_name}</span>}
        </p>
      </div>
      <Modal wide open={editing} title="Edit task" onClose={() => setEditing(false)}>
        {editing && <TaskForm task={task} onDone={() => setEditing(false)} />}
      </Modal>
    </li>
  )
}

interface Values {
  title: string
  description: string
  due_date: string
  priority: string
  assigned_to: string
  booking: string
}

/** Create (optionally pre-linked to an event) or edit a task. */
export function TaskForm({ task, bookingId, onDone }: { task?: Task; bookingId?: number; onDone: () => void }) {
  const { user, hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const { data: team } = useTeam()
  const { data: events } = useBookings({ upcoming: true, page_size: 100, ordering: 'event_date' })
  const save = useOpsMutation(ops.saveTask)
  const remove = useOpsMutation(ops.deleteTask)
  const { register, handleSubmit, control } = useForm<Values>({
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      due_date: task?.due_date ?? '',
      priority: String(task?.priority ?? 2),
      assigned_to: String(task?.assigned_to ?? (isManager ? '' : user?.id ?? '')),
      booking: String(task?.booking ?? bookingId ?? ''),
    },
  })

  const eventOptions = [
    { value: '', label: 'Not linked to an event' },
    ...(task?.booking_detail && !events?.results.some((e) => e.id === task.booking)
      ? [{ value: String(task.booking_detail.id), label: task.booking_detail.title }]
      : []),
    ...(events?.results ?? []).map((e) => ({ value: String(e.id), label: `${fmtShortDate(e.event_date)} · ${e.title}` })),
  ]
  const canDelete = task && isManager

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) =>
        save.mutate(
          {
            id: task?.id,
            title: v.title,
            description: v.description,
            due_date: v.due_date || null,
            priority: Number(v.priority) as Task['priority'],
            assigned_to: v.assigned_to ? Number(v.assigned_to) : null,
            // A disabled <select> submits nothing, so use the event we were opened from.
            booking: bookingId ?? (v.booking ? Number(v.booking) : null),
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <TextField label="Task *" required autoFocus className="sm:col-span-2" {...register('title')} />
      <TextAreaField label="Details" rows={2} className="sm:col-span-2" {...register('description')} />
      <Controller
        control={control}
        name="due_date"
        render={({ field }) => <DateField label="Due date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      />
      <SelectField label="Priority" options={TASK_PRIORITIES} {...register('priority')} />
      {isManager && (
        <SelectField
          label="Assigned to"
          options={[{ value: '', label: 'Nobody yet' }, ...(team ?? []).map((m) => ({ value: String(m.id), label: m.full_name }))]}
          {...register('assigned_to')}
        />
      )}
      <SelectField label="Event" options={eventOptions} disabled={!!bookingId} {...register('booking')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? remove.error} />
        <div className="flex items-center justify-end gap-2">
          {canDelete && (
            <div className="mr-auto">
              <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(task.id, { onSuccess: onDone })} />
            </div>
          )}
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {task ? 'Save' : 'Add task'}
          </Button>
        </div>
      </div>
    </form>
  )
}
