import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Modal'

import { EmptyState, Pagination, QueryState } from '../kit'
import { useTasks } from './api'
import { TaskForm, TaskItem } from './TaskItem'

const TABS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'undated', label: 'No date' },
  { value: 'done', label: 'Done' },
] as const
type Tab = (typeof TABS)[number]['value']
const PAGE_SIZE = 30

export default function TasksPage() {
  const { hasRole } = useAuth()
  const isManager = hasRole('OWNER', 'MANAGER')
  const canAdd = hasRole('OWNER', 'MANAGER', 'STAFF')
  const [tab, setTab] = useState<Tab>('today')
  const [mine, setMine] = useState(!isManager)
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)

  const base = { mine: mine || undefined, page_size: 1 }
  const overdue = useTasks({ ...base, when: 'overdue' })
  const today = useTasks({ ...base, when: 'today' })
  const counts: Partial<Record<Tab, number>> = { overdue: overdue.data?.count, today: today.data?.count }
  const { data, isLoading, error } = useTasks({ when: tab, mine: mine || undefined, page, page_size: PAGE_SIZE })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tasks" className="flex flex-wrap gap-1">
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
        <div className="ml-auto flex items-center gap-3">
          {isManager && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
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
          {canAdd && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add task
            </Button>
          )}
        </div>
      </div>
      <QueryState isLoading={isLoading} error={error} />
      {data && data.results.length === 0 && (
        <EmptyState>{tab === 'overdue' ? 'Nothing overdue.' : tab === 'today' ? 'Nothing due today.' : 'No tasks here.'}</EmptyState>
      )}
      <ul className="space-y-2">
        {data?.results.map((t) => (
          <TaskItem key={t.id} task={t} />
        ))}
      </ul>
      {data && data.count > 0 && <Pagination page={page} count={data.count} pageSize={PAGE_SIZE} onPage={setPage} />}
      <Modal wide open={adding} title="Add task" onClose={() => setAdding(false)}>
        {adding && <TaskForm onDone={() => setAdding(false)} />}
      </Modal>
    </div>
  )
}
