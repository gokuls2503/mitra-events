import clsx from 'clsx'
import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const CONTROL =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs ' +
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-stone-100'

interface WrapperProps {
  label: string
  error?: string
  hint?: string
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & WrapperProps

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : undefined}
        className={clsx(CONTROL, error && 'border-red-400')}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-err`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>
      )}
    </div>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  WrapperProps & { options: { value: string; label: string }[] }

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, error, hint, options, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select ref={ref} id={selectId} className={clsx(CONTROL, error && 'border-red-400')} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  )
})

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & WrapperProps

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextAreaField(
  { label, error, hint, className, id, rows = 3, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      <textarea ref={ref} id={fieldId} rows={rows} className={clsx(CONTROL, error && 'border-red-400')} {...rest} />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  )
})

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; hint?: string }

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxProps>(function CheckboxField(
  { label, hint, className, ...rest },
  ref,
) {
  return (
    <label className={clsx('flex items-start gap-2 text-sm', className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 size-4 accent-brand-700" {...rest} />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  )
})
