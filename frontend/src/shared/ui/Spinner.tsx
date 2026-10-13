import { LoaderCircle } from 'lucide-react'
import clsx from 'clsx'

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-label="Loading" className={clsx('animate-spin', className ?? 'size-5')} />
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center text-brand-700">
      <Spinner className="size-8" />
    </div>
  )
}
