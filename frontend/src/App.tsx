import { useRef, useState } from 'react'
import { searchPapers } from './api'
import Results, { type SearchStatus } from './components/Results'
import SearchBar from './components/SearchBar'
import type { SearchResponse } from './types'

function App() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [data, setData] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef<AbortController | null>(null)

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">AI Research Assistant</h1>
          <p className="text-sm text-slate-500">Search, save, and understand research papers</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <SearchBar onSearch={runSearch} loading={status === 'loading'} />
        <Results
          status={status}
          query={query}
          data={data}
          error={error}
          onRetry={() => runSearch(query)}
        />
      </main>
    </div>
  )
}

export default App
