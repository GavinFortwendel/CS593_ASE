import { useState } from 'react'
import type { Paper } from '../types'

const MAX_AUTHORS = 5
// Rough threshold for when a 4-line clamp would actually hide text.
const LONG_ABSTRACT_CHARS = 400

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown authors'
  if (authors.length <= MAX_AUTHORS) return authors.join(', ')
  return `${authors.slice(0, MAX_AUTHORS).join(', ')}, et al.`
}

interface Props {
  paper: Paper
  saved: boolean
  onSave?: () => Promise<void>
  onRemove?: () => Promise<void>
}

export default function PaperCard({ paper, saved, onSave, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const isLong = (paper.abstract?.length ?? 0) > LONG_ABSTRACT_CHARS
  const action = saved ? onRemove : onSave

  async function handleToggleSave() {
    if (!action) return
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg leading-snug font-semibold text-slate-900">
        {paper.url ? (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-600 hover:underline"
          >
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </h2>

      <p className="mt-1 text-sm text-slate-600">
        {formatAuthors(paper.authors)}
        <span className="mx-1.5 text-slate-400">·</span>
        {paper.year ?? 'n.d.'}
      </p>

      {paper.abstract ? (
        <div className="mt-3">
          <p className={`text-sm leading-relaxed text-slate-700 ${expanded ? '' : 'line-clamp-4'}`}>
            {paper.abstract}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="mt-1 text-sm font-medium text-indigo-600 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400 italic">No abstract available.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {action && (
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={busy}
            className={
              saved
                ? 'rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-700 hover:ring-red-200 disabled:opacity-50'
                : 'rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50'
            }
          >
            {busy ? (saved ? 'Removing…' : 'Saving…') : saved ? 'Saved ✓ · Remove' : 'Save to Library'}
          </button>
        )}
        {paper.pdf_url && (
          <a
            href={paper.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            Open PDF
          </a>
        )}
        {actionError && (
          <p role="alert" className="text-xs text-red-600">
            {actionError}
          </p>
        )}
      </div>
    </article>
  )
}
