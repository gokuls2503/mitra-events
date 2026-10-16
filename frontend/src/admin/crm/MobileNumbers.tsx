import { Plus } from 'lucide-react'
import { useId } from 'react'

const MAX_MOBILES = 3

/**
 * Up to three mobile numbers, each with a fixed "+91" in front. The first is required and
 * can't be removed. Extra boxes have no remove control in this release: an emptied box is
 * dropped on save.
 */
export function MobileNumbers({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const baseId = useId()
  const set = (i: number, digits: string) => onChange(values.map((v, j) => (j === i ? digits : v)))

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-1.5">
        <label htmlFor={`${baseId}-0`} className="text-sm font-medium text-stone-700">
          Mobile *
        </label>
        {values.length < MAX_MOBILES && (
          <button
            type="button"
            onClick={() => onChange([...values, ''])}
            aria-label="Add another mobile number"
            // Small plus; the ::after layer gives it a comfortable tap area.
            className="relative grid size-5 place-items-center text-brand-700 after:absolute after:-inset-3 after:content-[''] hover:text-brand-900"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {values.map((digits, i) => (
          <div key={i} className="flex rounded-lg border border-stone-300 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
            <span className="flex items-center border-r border-stone-200 px-3 text-sm text-stone-500 select-none" aria-hidden="true">
              +91
            </span>
            <input
              id={`${baseId}-${i}`}
              type="tel"
              inputMode="numeric"
              autoComplete={i === 0 ? 'tel-national' : 'off'}
              aria-label={i === 0 ? undefined : `Mobile number ${i + 1}`}
              placeholder="10-digit number"
              required={i === 0}
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="A 10-digit Indian mobile number, e.g. 9876543210"
              value={digits}
              onChange={(e) => set(i, e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="block w-full min-w-0 rounded-r-lg bg-white px-3 py-2 text-sm tabular-nums focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
