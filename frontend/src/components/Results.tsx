import { ApiError } from '../api'
import type { Paper, SearchResponse } from '../types'
import PaperCard from './PaperCard'

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  status: SearchStatus
  query: string
  data: SearchResponse | null
  error: unknown
  onRetry: () => void
  savedIds: Set<string>
  onSave: (paper: Paper) => Promise<void>
  onRemove: (paperId: string) => Promise<void>
}

function friendlyError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return { title: 'Cannot reach the server', detail: 'Make sure the backend is running on port 8000.' }
      case 503:
        return { title: 'Search is rate-limited', detail: 'Semantic Scholar is throttling requests. Wait a few seconds and retry.' }
      case 504:
        return { title: 'Search timed out', detail: 'Semantic Scholar took too long to respond. Try again.' }
      case 502:
        return { title: 'Paper search failed', detail: error.message }
      default:
        return { title: `Error ${error.status}`, detail: error.message }
    }
  }
  return { title: 'Something went wrong', detail: String(error) }
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
      <div className="h-5 w-3/4 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-1/2 rounded bg-slate-200" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded bg-slate-200" />
        <div className="h-3 rounded bg-slate-200" />
        <div className="h-3 w-5/6 rounded bg-slate-200" />
      </div>
    </div>
  )
}

export default function Results({
  status,
  query,
  data,
  error,
  onRetry,
  savedIds,
  onSave,
  onRemove,
}: Props) {
  if (status === 'idle') {
    return (
      <p className="mt-12 text-center text-slate-500">
        Search Semantic Scholar to find research papers.
      </p>
    )
  }

  if (status === 'loading') {
    return (
      <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading results">
        {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (status === 'error') {
    const { title, detail } = friendlyError(error)
    return (
      <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-semibold text-red-800">{title}</h2>
        <p className="mt-1 text-sm text-red-700">{detail}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.papers.length === 0) {
    return <p className="mt-12 text-center text-slate-500">No papers found for “{query}”.</p>
  }

  return (
    <section className="mt-6">
      <p className="mb-3 text-sm text-slate-500">
        Showing {data.papers.length} of {data.total.toLocaleString()} results for “{data.query}”
      </p>
      <div className="space-y-4">
        {data.papers.map((paper) => (
          <PaperCard
            key={paper.paper_id}
            paper={paper}
            saved={savedIds.has(paper.paper_id)}
            onSave={() => onSave(paper)}
            onRemove={() => onRemove(paper.paper_id)}
          />
        ))}
      </div>
    </section>
  )
}
