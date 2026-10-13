import { lazy, Suspense, type ComponentProps } from 'react'

// The form pulls in zod + react-hook-form; keep them out of the main public bundle.
const EnquiryFormImpl = lazy(() => import('./EnquiryForm').then((m) => ({ default: m.EnquiryForm })))

export function EnquiryForm(props: ComponentProps<typeof EnquiryFormImpl>) {
  return (
    <Suspense fallback={<div className="min-h-[28rem]" aria-busy="true" />}>
      <EnquiryFormImpl {...props} />
    </Suspense>
  )
}
