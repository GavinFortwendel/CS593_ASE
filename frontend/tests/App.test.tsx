import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../src/api'
import { ApiError } from '../src/api'
import App from '../src/App'
import type { SearchResponse } from '../src/types'
import { BACKEND, deferred, makeLibraryPaper, makePaper, makeSearchResponse, makeUpload, pdfFile } from './fixtures'

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  searchPapers: vi.fn(),
  listLibrary: vi.fn(),
  savePaper: vi.fn(),
  uploadPaper: vi.fn(),
  removePaper: vi.fn(),
  summarizePaper: vi.fn(),
  askPaper: vi.fn(),
}))

const m = {
  searchPapers: vi.mocked(api.searchPapers),
  listLibrary: vi.mocked(api.listLibrary),
  savePaper: vi.mocked(api.savePaper),
  uploadPaper: vi.mocked(api.uploadPaper),
  removePaper: vi.mocked(api.removePaper),
}

const nav = () => within(screen.getByRole('navigation'))
const libraryTab = () => nav().getByRole('button', { name: /^Library/ })
const searchTab = () => nav().getByRole('button', { name: 'Search' })

function search(query: string) {
  const input = screen.getByRole('searchbox', { name: 'Search papers' })
  fireEvent.change(input, { target: { value: query } })
  fireEvent.submit(input.closest('form')!)
}

async function renderApp(library = [makeLibraryPaper({ paper_id: 'lib1', title: 'Saved Paper' })]) {
  m.listLibrary.mockResolvedValue(library)
  render(<App />)
  await waitFor(() => expect(libraryTab()).toHaveTextContent(`Library (${library.length})`))
}

describe('App startup', () => {
  it('loads the library and shows the search prompt', async () => {
    const pending = deferred<ReturnType<typeof makeLibraryPaper>[]>()
    m.listLibrary.mockReturnValue(pending.promise)
    render(<App />)

    expect(screen.getByRole('heading', { name: 'AI Research Assistant' })).toBeInTheDocument()
    expect(screen.getByText('Search Semantic Scholar to find research papers.')).toBeInTheDocument()
    expect(libraryTab()).toHaveTextContent(/^Library$/) // no count until loaded
    expect(m.listLibrary).toHaveBeenCalledOnce()

    pending.resolve([makeLibraryPaper({ paper_id: 'a' }), makeLibraryPaper({ paper_id: 'b' })])
    await waitFor(() => expect(libraryTab()).toHaveTextContent('Library (2)'))
  })

  it('shows a library load error and recovers on retry', async () => {
    m.listLibrary
      .mockRejectedValueOnce(new ApiError(0, BACKEND.unreachable))
      .mockResolvedValueOnce([makeLibraryPaper({ title: 'Back Again' })])
    render(<App />)
    fireEvent.click(libraryTab())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load your library')
    expect(alert).toHaveTextContent(BACKEND.unreachable)
    expect(libraryTab()).toHaveTextContent(/^Library$/)

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Back Again')).toBeInTheDocument()
    expect(m.listLibrary).toHaveBeenCalledTimes(2)
    expect(libraryTab()).toHaveTextContent('Library (1)')
  })
})

describe('App search', () => {
  it('searches, shows loading, then results', async () => {
    const pending = deferred<SearchResponse>()
    m.searchPapers.mockReturnValue(pending.promise)
    await renderApp()

    search('  transformers ')

    expect(m.searchPapers).toHaveBeenCalledExactlyOnceWith('transformers', { signal: expect.any(AbortSignal) })
    expect(screen.getByLabelText('Loading results')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled()

    pending.resolve(makeSearchResponse([makePaper({ paper_id: 'r1', title: 'Result One' })], { total: 57 }))

    expect(await screen.findByText('Result One')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 57 results for “transformers”')).toBeInTheDocument()
    expect(screen.queryByLabelText('Loading results')).not.toBeInTheDocument()
  })

  it('shows the 503 rate-limit error and retries the same query', async () => {
    m.searchPapers
      .mockRejectedValueOnce(new ApiError(503, BACKEND.searchRateLimited))
      .mockResolvedValueOnce(makeSearchResponse([makePaper({ title: 'After Retry' })]))
    await renderApp()

    search('transformers')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Search is rate-limited')
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('After Retry')).toBeInTheDocument()
    expect(m.searchPapers).toHaveBeenNthCalledWith(2, 'transformers', expect.anything())
  })

  it('ignores a slow older search once a newer one has started', async () => {
    // Behaves like fetch: rejects with AbortError when its signal is aborted.
    const first = deferred<SearchResponse>()
    m.searchPapers.mockImplementationOnce((_q, opts) => {
      opts!.signal!.addEventListener('abort', () => first.reject(new DOMException('Aborted', 'AbortError')))
      return first.promise
    })
    m.searchPapers.mockResolvedValueOnce(makeSearchResponse([makePaper({ title: 'Newer Result' })], { query: 'newer' }))
    await renderApp()

    search('older')
    search('newer')

    expect(await screen.findByText('Newer Result')).toBeInTheDocument()
    const firstSignal = m.searchPapers.mock.calls[0][1]!.signal!
    expect(firstSignal.aborted).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('marks results that are already in the library', async () => {
    m.searchPapers.mockResolvedValue(
      makeSearchResponse([makePaper({ paper_id: 'lib1', title: 'Saved Paper' }), makePaper({ paper_id: 'x', title: 'Other' })]),
    )
    await renderApp()

    search('transformers')

    const [saved, other] = await screen.findAllByRole('article')
    expect(within(saved).getByRole('button', { name: 'Saved ✓ · Remove' })).toBeInTheDocument()
    expect(within(other).getByRole('button', { name: 'Save to Library' })).toBeInTheDocument()
  })

  it('saves a result into the library', async () => {
    const result = makePaper({ paper_id: 'new1', title: 'Fresh Paper' })
    m.searchPapers.mockResolvedValue(makeSearchResponse([result]))
    m.savePaper.mockResolvedValue(makeLibraryPaper({ ...result, saved_at: '2026-11-03T10:00:00Z' }))
    await renderApp()

    search('transformers')
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }))

    expect(m.savePaper).toHaveBeenCalledExactlyOnceWith(result)
    expect(await screen.findByRole('button', { name: 'Saved ✓ · Remove' })).toBeInTheDocument()
    expect(libraryTab()).toHaveTextContent('Library (2)')

    fireEvent.click(libraryTab())
    const titles = screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent)
    expect(titles).toEqual(['Fresh Paper', 'Saved Paper']) // newest first
  })

  it('shows save errors inline and leaves the library unchanged', async () => {
    m.searchPapers.mockResolvedValue(makeSearchResponse([makePaper({ paper_id: 'new1' })]))
    m.savePaper.mockRejectedValue(new ApiError(0, BACKEND.unreachable))
    await renderApp()

    search('transformers')
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(BACKEND.unreachable)
    expect(libraryTab()).toHaveTextContent('Library (1)')
  })

  it('removes a saved paper from the search results view', async () => {
    m.searchPapers.mockResolvedValue(makeSearchResponse([makePaper({ paper_id: 'lib1' })]))
    m.removePaper.mockResolvedValue(undefined)
    await renderApp()

    search('transformers')
    fireEvent.click(await screen.findByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(m.removePaper).toHaveBeenCalledExactlyOnceWith('lib1')
    expect(await screen.findByRole('button', { name: 'Save to Library' })).toBeInTheDocument()
    expect(libraryTab()).toHaveTextContent('Library (0)')
  })

  it('keeps the query and results when switching tabs', async () => {
    m.searchPapers.mockResolvedValue(makeSearchResponse([makePaper({ paper_id: 'r1', title: 'Result One' })]))
    await renderApp()
    search('transformers')
    await screen.findByText('Result One')

    fireEvent.click(libraryTab())
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument() // hidden, not just covered
    fireEvent.click(searchTab())

    expect(screen.getByRole('searchbox')).toHaveValue('transformers')
    expect(screen.getByText('Result One')).toBeInTheDocument()
    expect(m.searchPapers).toHaveBeenCalledOnce()
  })
})

describe('App library', () => {
  it('shows saved papers in the Library tab', async () => {
    await renderApp([makeLibraryPaper({ paper_id: 'a', title: 'Paper A' }), makeUpload({ title: 'Paper B' })])
    fireEvent.click(libraryTab())
    expect(screen.getByText('2 saved papers')).toBeInTheDocument()
    expect(screen.getByText('Paper A')).toBeInTheDocument()
    expect(screen.getByText('Paper B')).toBeInTheDocument()
  })

  it('removes a paper from the library', async () => {
    m.removePaper.mockResolvedValue(undefined)
    await renderApp()
    fireEvent.click(libraryTab())

    fireEvent.click(screen.getByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(m.removePaper).toHaveBeenCalledExactlyOnceWith('lib1')
    expect(await screen.findByText('Your library is empty. Save papers from search results or upload a PDF.')).toBeInTheDocument()
    expect(libraryTab()).toHaveTextContent('Library (0)')
  })

  it('keeps the paper and shows the error when removal fails', async () => {
    m.removePaper.mockRejectedValue(new ApiError(404, 'Paper not in library'))
    await renderApp()
    fireEvent.click(libraryTab())

    fireEvent.click(screen.getByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Paper not in library')
    expect(screen.getByText('Saved Paper')).toBeInTheDocument()
    expect(libraryTab()).toHaveTextContent('Library (1)')
  })

  it('adds an uploaded PDF to the top of the library', async () => {
    const uploaded = makeUpload({ title: 'Freshly Uploaded' })
    m.uploadPaper.mockResolvedValue(uploaded)
    await renderApp()
    fireEvent.click(libraryTab())

    const file = pdfFile('fresh.pdf')
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    expect(m.uploadPaper).toHaveBeenCalledExactlyOnceWith(file)
    expect(await screen.findByText('Freshly Uploaded')).toBeInTheDocument()
    const titles = screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent)
    expect(titles).toEqual(['Freshly Uploaded', 'Saved Paper'])
    expect(libraryTab()).toHaveTextContent('Library (2)')
  })

  it('shows a 422 upload processing error without changing the library', async () => {
    m.uploadPaper.mockRejectedValue(new ApiError(422, BACKEND.scannedPdf))
    await renderApp()
    fireEvent.click(libraryTab())

    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [pdfFile()] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(BACKEND.scannedPdf)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(libraryTab()).toHaveTextContent('Library (1)')
  })
})
