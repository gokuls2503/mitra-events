import clsx from 'clsx'
import { useState } from 'react'

import { useAuth } from '@/shared/auth/useAuth'

import { EmptyState, Pagination, QueryState } from '../kit'
import { useFollowUps } from './api'
import { FollowUpRow } from './FollowUpRow'

const TABS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'done', label: 'Done' },
] as const
type Tab = (typeof TABS)[number]['value']

const PAGE_SIZE = 25

export default function FollowUpsPage() {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const canWrite = hasRole('OWNER', 'MANAGER', 'STAFF')
  const [tab, setTab] = useState<Tab>('today')
  const [mine, setMine] = useState(!isManager)
  const [page, setPage] = useState(1)

  const base = { mine: mine || undefined, page_size: 1 }
  const overdue = useFollowUps({ ...base, due: 'overdue' })
  const today = useFollowUps({ ...base, due: 'today' })
  const counts: Partial<Record<Tab, number | undefined>> = { overdue: overdue.data?.count, today: today.data?.count }

  const { data, isLoading, error } = useFollowUps({ due: tab, mine: mine || undefined, page, page_size: PAGE_SIZE })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Follow-ups" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => {
                setTab(t.value)
                setPage(1)
              }}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm',
                tab === t.value ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200',
              )}
            >
              {t.label}
              {!!counts[t.value] && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 text-[11px] font-semibold',
                    t.value === 'overdue' ? 'bg-red-600 text-white' : tab === t.value ? 'bg-white/25' : 'bg-stone-200',
                  )}
                >
                  {counts[t.value]}
                </span>
              )}
            </button>
          ))}
        </div>
        {isManager && (
          <label className="ml-auto flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              className="size-4 accent-brand-700"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked)
                setPage(1)
              }}
            />
            Only mine
          </label>
        )}
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && (
        <EmptyState>{tab === 'overdue' ? 'Nothing overdue. Nice work!' : tab === 'today' ? 'No follow-ups due today.' : 'Nothing here.'}</EmptyState>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {data?.results.map((f) => (
          <FollowUpRow key={f.id} fu={f} canWrite={canWrite} showLead />
        ))}
      </ul>
      {data && data.count > 0 && <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
    </div>
  )
}
