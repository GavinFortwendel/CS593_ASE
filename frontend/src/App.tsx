import { useEffect, useMemo, useRef, useState } from 'react'
import { listLibrary, removePaper, savePaper, searchPapers, uploadPaper } from './api'
import LibraryView, { type LibraryStatus } from './components/LibraryView'
import Results, { type SearchStatus } from './components/Results'
import SearchBar from './components/SearchBar'
import type { LibraryPaper, Paper, SearchResponse } from './types'

type View = 'search' | 'library'

function App() {
  const [view, setView] = useState<View>('search')

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [data, setData] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef<AbortController | null>(null)

  // The library lives here (not in LibraryView) so Search and Library share one source of truth
  // for which papers are saved.
  const [library, setLibrary] = useState<LibraryPaper[]>([])
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>('loading')
  const [libraryError, setLibraryError] = useState<unknown>(null)
  const savedIds = useMemo(() => new Set(library.map((p) => p.paper_id)), [library])

  async function runSearch(q: string) {
    // Cancel any older request so a slow response can't overwrite newer results.
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    setQuery(q)
    setStatus('loading')
    setError(null)
    try {
      const result = await searchPapers(q, { signal: controller.signal })
      setData(result)
      setStatus('success')
    } catch (err) {
      if (controller.signal.aborted) return // superseded by a newer search
      setError(err)
      setStatus('error')
    }
  }

  // Bumping this key re-runs the fetch effect (used by Retry).
  const [libraryLoadKey, setLibraryLoadKey] = useState(0)

  useEffect(() => {
    // State is only set in the async callbacks; 'loading' is the initial state and retryLibrary
    // resets it before bumping the key. `ignore` drops stale responses (e.g. StrictMode's double run).
    let ignore = false
    listLibrary().then(
      (papers) => {
        if (ignore) return
        setLibrary(papers)
        setLibraryStatus('success')
      },
      (err) => {
        if (ignore) return
        setLibraryError(err)
        setLibraryStatus('error')
      },
    )
    return () => {
      ignore = true
    }
  }, [libraryLoadKey])

  function retryLibrary() {
    setLibraryStatus('loading')
    setLibraryError(null)
    setLibraryLoadKey((k) => k + 1)
  }

  // State changes only after the server confirms (no optimistic updates); errors propagate to
  // the PaperCard, which shows them inline.
  async function handleSave(paper: Paper) {
    const saved = await savePaper(paper)
    setLibrary((prev) => [saved, ...prev.filter((p) => p.paper_id !== saved.paper_id)])
  }

  async function handleUpload(file: File) {
    const uploaded = await uploadPaper(file)
    setLibrary((prev) => [uploaded, ...prev])
  }

  async function handleRemove(paperId: string) {
    await removePaper(paperId)
    setLibrary((prev) => prev.filter((p) => p.paper_id !== paperId))
  }

  function tabClass(tab: View) {
    return `rounded-md px-3 py-1.5 text-sm font-medium ${
      view === tab ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
    }`
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Research Assistant</h1>
            <p className="text-sm text-slate-500">Search, save, and understand research papers</p>
          </div>
          <nav className="flex gap-1">
            <button type="button" onClick={() => setView('search')} className={tabClass('search')}>
              Search
            </button>
            <button type="button" onClick={() => setView('library')} className={tabClass('library')}>
              Library{libraryStatus === 'success' && ` (${library.length})`}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Hidden rather than unmounted so the search box text and results survive tab switches. */}
        <div hidden={view !== 'search'}>
          <SearchBar onSearch={runSearch} loading={status === 'loading'} />
          <Results
            status={status}
            query={query}
            data={data}
            error={error}
            onRetry={() => runSearch(query)}
            savedIds={savedIds}
            onSave={handleSave}
            onRemove={handleRemove}
          />
        </div>
        {view === 'library' && (
          <LibraryView
            status={libraryStatus}
            papers={library}
            error={libraryError}
            onRetry={retryLibrary}
            onRemove={handleRemove}
            onUpload={handleUpload}
          />
        )}
      </main>
    </div>
  )
}

export default App
