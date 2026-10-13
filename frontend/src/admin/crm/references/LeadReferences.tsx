import clsx from 'clsx'
import { ChevronRight, ImageIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { formatAmount } from '@/shared/format'
import { Drawer } from '@/shared/ui/Drawer'

import { useLeadImages, useLeadItems, type LeadImage } from './api'
import { ImagesTab } from './ImagesTab'
import { ItemsTab } from './ItemsTab'

type Tab = 'design' | 'stage' | 'items'

const TITLES: Record<Tab, string> = {
  design: 'Design references',
  stage: 'Stage / venue',
  items: 'Items & materials',
}

/**
 * Design, Stage and Items summary cards, plus the drawer they open.
 * Used on the lead page, and on the event page after the lead is converted.
 */
export function LeadReferences({ leadId, eyebrow, canWrite }: { leadId: number; eyebrow: string; canWrite: boolean }) {
  const [tab, setTab] = useState<Tab | null>(null)
  const images = useLeadImages(leadId)
  const items = useLeadItems(leadId)
  const design = (images.data ?? []).filter((i) => i.section === 'design')
  const stage = (images.data ?? []).filter((i) => i.section === 'stage')

  return (
    <>
      <ImagesCard title="Design" images={design} loading={images.isLoading} error={!!images.error} onOpen={() => setTab('design')} />
      <ImagesCard title="Stage / venue" images={stage} loading={images.isLoading} error={!!images.error} onOpen={() => setTab('stage')} />
      <SummaryCard
        title="Items"
        count={items.data ? `${items.data.count} item${items.data.count === 1 ? '' : 's'}` : undefined}
        onOpen={() => setTab('items')}
      >
        {items.isLoading && <Skeleton rows />}
        {items.error && <p className="text-sm text-red-700">Couldn't load items.</p>}
        {items.data && items.data.count === 0 && <p className="text-sm text-stone-500">No materials yet{canWrite ? ' — tap to add' : ''}.</p>}
        {items.data && items.data.count > 0 && (
          <>
            <ul className="space-y-1 text-sm">
              {items.data.items.slice(0, 3).map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="truncate text-stone-700">{i.name}</span>
                  <span className="shrink-0 tabular-nums">{formatAmount(i.amount)}</span>
                </li>
              ))}
            </ul>
            {items.data.count > 3 && <p className="mt-1 text-xs text-stone-500">+{items.data.count - 3} more</p>}
            <div className="mt-2 flex justify-between border-t border-stone-100 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatAmount(items.data.total)}</span>
            </div>
          </>
        )}
      </SummaryCard>

      <Drawer
        open={tab !== null}
        onClose={() => setTab(null)}
        eyebrow={eyebrow}
        title={tab ? TITLES[tab] : ''}
        header={
          <div role="tablist" aria-label="Sections" className="flex gap-1">
            {(['design', 'stage', 'items'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={clsx('h-11 rounded-full px-4 text-sm', tab === t ? 'bg-brand-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
              >
                {t === 'design' ? 'Design' : t === 'stage' ? 'Stage' : 'Items'}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'design' && <ImagesTab key="design" leadId={leadId} section="design" canWrite={canWrite} />}
        {tab === 'stage' && <ImagesTab key="stage" leadId={leadId} section="stage" canWrite={canWrite} />}
        {tab === 'items' && <ItemsTab leadId={leadId} canWrite={canWrite} />}
      </Drawer>
    </>
  )
}

function SummaryCard({ title, count, onOpen, children }: { title: string; count?: string; onOpen: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-xl border border-stone-200 bg-white p-5 text-left transition hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-700"
    >
      <span className="mb-3 flex items-center gap-2">
        <span className="font-sans text-sm font-semibold tracking-wide text-stone-800 uppercase">{title}</span>
        {count && (
          <span className="ml-auto flex items-center text-xs text-stone-500">
            {count} <ChevronRight className="size-3.5" />
          </span>
        )}
      </span>
      {children}
    </button>
  )
}

function ImagesCard({ title, images, loading, error, onOpen }: { title: string; images: LeadImage[]; loading: boolean; error: boolean; onOpen: () => void }) {
  return (
    <SummaryCard title={title} count={loading || error ? undefined : `${images.length} image${images.length === 1 ? '' : 's'}`} onOpen={onOpen}>
      {loading && <Skeleton />}
      {error && <span className="text-sm text-red-700">Couldn't load images.</span>}
      {!loading && !error && images.length === 0 && (
        <span className="flex items-center gap-2 text-sm text-stone-500">
          <ImageIcon className="size-4" /> No images yet
        </span>
      )}
      {images.length > 0 && (
        <span className="grid grid-cols-3 gap-2">
          {images.slice(0, 3).map((img) => (
            <img key={img.id} src={img.thumbnail ?? img.image} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </span>
      )}
    </SummaryCard>
  )
}

function Skeleton({ rows }: { rows?: boolean }) {
  return rows ? (
    <span className="block space-y-2" aria-busy="true">
      <span className="block h-4 animate-pulse rounded bg-stone-100" />
      <span className="block h-4 w-2/3 animate-pulse rounded bg-stone-100" />
    </span>
  ) : (
    <span className="grid grid-cols-3 gap-2" aria-busy="true">
      {[0, 1, 2].map((n) => (
        <span key={n} className="aspect-square animate-pulse rounded-lg bg-stone-100" />
      ))}
    </span>
  )
}
