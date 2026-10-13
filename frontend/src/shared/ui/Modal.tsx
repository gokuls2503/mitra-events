import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Thin wrapper over <dialog> — gives focus trapping and Esc-to-close for free. */
export function Modal({ open, title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // <dialog> fires `close` however it closes. Only report closes the user made (Esc, ✕),
  // not ones caused by `open` turning false — otherwise onClose can undo the parent's own
  // navigation or state change.
  const closingFromProp = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) {
      closingFromProp.current = true
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        // React passes a nested dialog's close up the tree (e.g. the image viewer inside the
        // drawer); only react to this dialog's own close.
        if (e.target !== e.currentTarget) return
        if (closingFromProp.current) {
          closingFromProp.current = false
          return
        }
        onClose()
      }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
        <h2 className="font-sans text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  )
}
