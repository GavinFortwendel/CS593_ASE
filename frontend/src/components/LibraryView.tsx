import type { LibraryPaper } from '../types'
import PaperCard from './PaperCard'
import { SkeletonCard } from './Results'
import UploadPdf from './UploadPdf'

export type LibraryStatus = 'loading' | 'success' | 'error'

interface Props {
  status: LibraryStatus
  papers: LibraryPaper[]
  error: unknown
  onRetry: () => void
  onRemove: (paperId: string) => Promise<void>
  onUpload: (file: File) => Promise<void>
}

export default function LibraryView({ status, papers, error, onRetry, onRemove, onUpload }: Props) {
  if (status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading library">
        {Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-semibold text-red-800">Could not load your library</h2>
        <p className="mt-1 text-sm text-red-700">
          {error instanceof Error ? error.message : String(error)}
        </p>
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

  if (papers.length === 0) {
    return (
      <section>
        <UploadPdf onUpload={onUpload} />
        <p className="mt-12 text-center text-slate-500">
          Your library is empty. Save papers from search results or upload a PDF.
        </p>
      </section>
    )
  }

  return (
    <section>
      <UploadPdf onUpload={onUpload} />
      <p className="mb-3 text-sm text-slate-500">
        {papers.length} saved {papers.length === 1 ? 'paper' : 'papers'}
      </p>
      <div className="space-y-4">
        {papers.map((paper) => (
          <PaperCard
            key={paper.paper_id}
            paper={paper}
            saved
            onRemove={() => onRemove(paper.paper_id)}
          />
        ))}
      </div>
    </section>
  )
}
