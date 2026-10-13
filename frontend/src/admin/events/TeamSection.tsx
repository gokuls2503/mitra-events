import clsx from 'clsx'
import { AlertTriangle, Phone, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { useAuth } from '@/shared/auth/useAuth'
import { fmtDate, fmtTime } from '@/shared/dates'
import { formatINR, prettyPhone, telLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'
import { SelectField, TextField } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'

import { useTeam, type Booking } from '../crm/api'
import { DeleteButton, FormError } from '../kit'
import { ASSIGNMENT_STATUSES, ops, useAssignments, useOpsMutation, useVendors, type Assignment } from '../ops/api'

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  DONE: 'bg-stone-100 text-stone-600',
  CANCELLED: 'bg-stone-100 text-stone-400 line-through',
}

export function TeamSection({ booking }: { booking: Booking }) {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const { data: assignments = [] } = useAssignments({ booking: booking.id })
  const [editing, setEditing] = useState<Assignment | 'staff' | 'vendor' | null>(null)
  const people = assignments.filter((a) => a.staff)
  const vendors = assignments.filter((a) => a.vendor)
  const vendorCost = vendors.filter((a) => a.status !== 'CANCELLED').reduce((sum, a) => sum + Number(a.agreed_cost ?? 0), 0)

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Users className="size-4 text-stone-400" />
        <h2 className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">Team & vendors</h2>
        {isManager && (
          <div className="ml-auto flex gap-2 print:hidden">
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditing('staff')}>
              <Plus className="size-3.5" /> Team member
            </Button>
            <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditing('vendor')}>
              <Plus className="size-3.5" /> Vendor
            </Button>
          </div>
        )}
      </header>

      {assignments.length === 0 && <p className="text-sm text-stone-500">Nobody assigned yet.</p>}
      {people.length > 0 && <AssignmentList title="Our team" items={people} onEdit={isManager ? setEditing : undefined} />}
      {vendors.length > 0 && (
        <AssignmentList
          title="Vendors"
          items={vendors}
          onEdit={isManager ? setEditing : undefined}
          footer={vendorCost > 0 && isManager ? `Vendor cost: ${formatINR(vendorCost)}` : undefined}
        />
      )}

      <Modal
        open={editing !== null}
        title={editing === 'staff' ? 'Add team member' : editing === 'vendor' ? 'Add vendor' : 'Edit assignment'}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <AssignmentForm
            booking={booking}
            assignment={typeof editing === 'object' ? editing : undefined}
            kind={typeof editing === 'object' ? (editing.staff ? 'staff' : 'vendor') : editing}
            taken={people.map((p) => p.staff!)}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </section>
  )
}

function AssignmentList({
  title,
  items,
  onEdit,
  footer,
}: {
  title: string
  items: Assignment[]
  onEdit?: (a: Assignment) => void
  footer?: string
}) {
  return (
    <div className="mt-3 first-of-type:mt-0">
      <h3 className="mb-1.5 font-sans text-xs font-medium text-stone-500">{title}</h3>
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {items.map((a) => (
          <li key={a.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm', a.status === 'CANCELLED' && 'opacity-60')}>
            <button onClick={() => onEdit?.(a)} disabled={!onEdit} className={clsx('min-w-0 text-left', onEdit && 'hover:text-brand-700')}>
              <span className="font-medium">{a.staff_name ?? a.vendor_name}</span>
              <span className="text-stone-500"> · {a.role}</span>
              {a.vendor_category && <span className="block text-xs text-stone-400">{a.vendor_category}</span>}
            </button>
            {a.report_time && <span className="text-xs text-stone-600">Report {fmtTime(a.report_time)}</span>}
            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[a.status])}>{a.status_label}</span>
            <span className="ml-auto flex items-center gap-2">
              {a.agreed_cost && <span className="text-xs text-stone-600 print:hidden">{formatINR(a.agreed_cost)}</span>}
              {a.phone && (
                <a href={telLink(a.phone)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-stone-600 hover:bg-stone-100" aria-label={`Call ${a.staff_name ?? a.vendor_name}`}>
                  <Phone className="size-3" /> <span className="hidden sm:inline print:inline">{prettyPhone(a.phone)}</span>
                </a>
              )}
            </span>
            {a.conflicts.length > 0 && a.status !== 'CANCELLED' && (
              <p className="flex w-full items-start gap-1 text-xs text-amber-800 print:hidden">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Also booked for{' '}
                  {a.conflicts.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ', '}
                      <Link to={`/admin/events/${c.id}`} className="underline">
                        {c.title}
                      </Link>{' '}
                      ({fmtDate(c.event_date)})
                    </span>
                  ))}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1.5 text-right text-xs text-stone-500 print:hidden">{footer}</p>}
    </div>
  )
}

interface Values {
  staff: string
  vendor: string
  role: string
  report_time: string
  agreed_cost: string
  status: string
  notes: string
}

function AssignmentForm({
  booking,
  assignment,
  kind,
  taken,
  onDone,
}: {
  booking: Booking
  assignment?: Assignment
  kind: 'staff' | 'vendor'
  taken: number[]
  onDone: () => void
}) {
  const { data: team } = useTeam()
  const { data: vendors } = useVendors({ is_active: true, page_size: 500 }, )
  const save = useOpsMutation(ops.saveAssignment)
  const remove = useOpsMutation(ops.deleteAssignment)
  const { register, handleSubmit } = useForm<Values>({
    defaultValues: {
      staff: String(assignment?.staff ?? ''),
      vendor: String(assignment?.vendor ?? ''),
      role: assignment?.role ?? (kind === 'staff' ? 'Decor team' : ''),
      report_time: assignment?.report_time?.slice(0, 5) ?? booking.setup_time?.slice(0, 5) ?? '',
      agreed_cost: assignment?.agreed_cost ?? '',
      status: assignment?.status ?? (kind === 'staff' ? 'CONFIRMED' : 'PENDING'),
      notes: assignment?.notes ?? '',
    },
  })

  const staffOptions = (team ?? [])
    .filter((m) => !taken.includes(m.id) || m.id === assignment?.staff)
    .map((m) => ({ value: String(m.id), label: m.full_name }))
  const vendorOptions = (vendors?.results ?? []).map((v) => ({ value: String(v.id), label: `${v.name} — ${v.category_label}` }))
  if (assignment?.vendor && !vendorOptions.some((o) => o.value === String(assignment.vendor))) {
    vendorOptions.unshift({ value: String(assignment.vendor), label: assignment.vendor_name ?? 'Vendor' })
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) =>
        save.mutate(
          {
            id: assignment?.id,
            booking: booking.id,
            staff: kind === 'staff' ? Number(v.staff) : null,
            vendor: kind === 'vendor' ? Number(v.vendor) : null,
            role: v.role,
            report_time: v.report_time || null,
            agreed_cost: kind === 'vendor' && v.agreed_cost ? v.agreed_cost : null,
            status: v.status as Assignment['status'],
            notes: v.notes,
          },
          { onSuccess: onDone },
        ),
      )}
    >
      {kind === 'staff' ? (
        <SelectField label="Team member *" required options={[{ value: '', label: 'Choose…' }, ...staffOptions]} {...register('staff')} />
      ) : (
        <SelectField
          label="Vendor *"
          required
          options={[{ value: '', label: vendorOptions.length ? 'Choose…' : 'Add vendors under Tasks & vendors first' }, ...vendorOptions]}
          {...register('vendor')}
        />
      )}
      <TextField label="Role / work *" required placeholder={kind === 'vendor' ? 'e.g. Mandap flowers' : 'e.g. Stage decor lead'} {...register('role')} />
      <TextField label="Report at venue by" type="time" {...register('report_time')} />
      <SelectField label="Status" options={ASSIGNMENT_STATUSES} {...register('status')} />
      {kind === 'vendor' && <TextField label="Agreed cost (₹)" type="number" min={0} hint="What we pay them for this event." {...register('agreed_cost')} />}
      <TextField label="Notes" className={kind === 'staff' ? 'sm:col-span-2' : ''} {...register('notes')} />
      <div className="space-y-3 sm:col-span-2">
        <FormError error={save.error ?? remove.error} />
        <div className="flex items-center justify-end gap-2">
          {assignment && (
            <div className="mr-auto">
              <DeleteButton pending={remove.isPending} onDelete={() => remove.mutate(assignment.id, { onSuccess: onDone })} />
            </div>
          )}
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
