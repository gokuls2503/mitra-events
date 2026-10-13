import clsx from 'clsx'
import { Phone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { fmtDateTime, fromNow, isPast } from '@/shared/dates'
import { telLink } from '@/shared/format'
import { Button } from '@/shared/ui/Button'

import { FormError } from '../kit'
import { crm, useCrmMutation, type FollowUp } from './api'

export function FollowUpRow({ fu, canWrite, showLead }: { fu: FollowUp; canWrite: boolean; showLead?: boolean }) {
  const [completing, setCompleting] = useState(false)
  const [outcome, setOutcome] = useState('')
  const complete = useCrmMutation(crm.completeFollowUp)
  const overdue = !fu.completed_at && isPast(fu.due_at)

  return (
    <li className={clsx('rounded-lg border p-3 text-sm', overdue ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {showLead && (
            <Link to={`/admin/crm/leads/${fu.lead}`} className="font-medium text-brand-800 hover:underline">
              {fu.lead_name}
            </Link>
          )}
          <p className={clsx(showLead ? 'text-stone-600' : 'font-medium')}>
            {fu.kind_label} · <span className={clsx(overdue && 'font-semibold text-red-700')}>{fmtDateTime(fu.due_at)}</span>
            <span className="text-xs text-stone-500"> ({fromNow(fu.due_at)})</span>
          </p>
          {fu.notes && <p className="text-xs text-stone-600">{fu.notes}</p>}
          {fu.assigned_to_name && <p className="text-xs text-stone-500">For {fu.assigned_to_name}</p>}
        </div>
        {showLead && (
          <a href={telLink(fu.lead_phone)} aria-label={`Call ${fu.lead_name}`} className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100">
            <Phone className="size-4" />
          </a>
        )}
        {canWrite && !fu.completed_at && !completing && (
          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setCompleting(true)}>
            Done
          </Button>
        )}
      </div>
      {completing && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            complete.mutate({ id: fu.id, outcome }, { onSuccess: () => setCompleting(false) })
          }}
        >
          <input
            autoFocus
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What happened? (optional)"
            aria-label="Outcome"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2 py-1 text-sm"
          />
          <Button type="submit" className="px-2.5 py-1 text-xs" loading={complete.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setCompleting(false)}>
            Cancel
          </Button>
        </form>
      )}
      <FormError error={complete.error} />
    </li>
  )
}
