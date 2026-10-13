import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/** Shows a message instead of a blank screen if a page crashes while rendering. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
        <h2 className="font-sans text-lg font-semibold text-stone-900">Something went wrong on this page</h2>
        <p className="mt-1 text-sm text-stone-600">Your data is safe. Reload the page, or go back and try again.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          Reload
        </button>
      </div>
    )
  }
}
