import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-700',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 focus-visible:outline-brand-700',
  ghost: 'text-stone-700 hover:bg-stone-100 focus-visible:outline-brand-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

export function Button({ variant = 'primary', loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}
