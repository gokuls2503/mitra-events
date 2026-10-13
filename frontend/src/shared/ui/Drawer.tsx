import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  /** Small line above the title, e.g. "Demo Lead 2 · Engagement". */
  eyebrow?: string
  title: string
  /** Rendered under the title (e.g. tabs). */
  header?: ReactNode
  children: ReactNode
}

/**
 * Right-hand slide-in panel (full width on phones). Built on <dialog> like Modal, so focus
 * trapping and Esc come for free. Also closes on ✕ or a click on the backdrop.
 */
export function Drawer({ open, onClose, eyebrow, title, header, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
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
      aria-label={title}
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
      // A click whose target is the <dialog> itself landed on the backdrop, not the panel.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="drawer m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 sm:max-w-xl"
    >
      <div className="flex h-full flex-col bg-white shadow-2xl">
        <header className="border-b border-stone-200 px-4 pt-4 pb-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {eyebrow && <p className="truncate text-xs text-stone-500">{eyebrow}</p>}
              <h2 className="text-2xl font-semibold text-brand-800">{title}</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100"
            >
              <X className="size-5" />
            </button>
          </div>
          {header && <div className="mt-3">{header}</div>}
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{open && children}</div>
      </div>
    </dialog>
  )
}
