/**
 * Tests api.ts itself. Instead of mocking the module, the global fetch is replaced by a fake, so
 * the real request wrapper, URL building and error parsing run (still with no network access).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../src/api'
import { ApiError } from '../src/api'
import { makePaper } from './fixtures'

const BASE = 'http://localhost:8000'
const UNREACHABLE = 'Cannot reach the server. Is the backend running on port 8000?'

const fetchMock = vi.fn<typeof fetch>()

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** The single fetch call as [url, init]. */
function lastCall(): [string, RequestInit | undefined] {
  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]
  return [String(url), init]
}

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  return err as ApiError
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('request URLs and payloads', () => {
  it('searchPapers builds the query string with default paging', async () => {
    const body = { query: 'graph neural networks', total: 0, offset: 0, papers: [] }
    fetchMock.mockResolvedValue(json(body))

    await expect(api.searchPapers('graph neural networks')).resolves.toEqual(body)

    const [url, init] = lastCall()
    expect(url).toBe(`${BASE}/api/search?q=graph+neural+networks&limit=10&offset=0`)
    expect(init).toEqual({ signal: undefined })
  })

  it('searchPapers encodes special characters and forwards paging and signal', async () => {
    fetchMock.mockResolvedValue(json({ query: '', total: 0, offset: 20, papers: [] }))
    const controller = new AbortController()

    await api.searchPapers('C++ & "AI"?', { limit: 5, offset: 20, signal: controller.signal })

    const [url, init] = lastCall()
    const parsed = new URL(url)
    expect(parsed.searchParams.get('q')).toBe('C++ & "AI"?')
    expect(parsed.searchParams.get('limit')).toBe('5')
    expect(parsed.searchParams.get('offset')).toBe('20')
    expect(url).toContain('q=C%2B%2B+%26+%22AI%22%3F')
    expect(init?.signal).toBe(controller.signal)
  })

  it('listLibrary GETs the library', async () => {
    fetchMock.mockResolvedValue(json([{ paper_id: 'p1' }]))
    await expect(api.listLibrary()).resolves.toEqual([{ paper_id: 'p1' }])
    expect(lastCall()).toEqual([`${BASE}/api/library`, undefined])
  })

  it('savePaper POSTs the paper as JSON', async () => {
    const paper = makePaper()
    fetchMock.mockResolvedValue(json({ ...paper, source: 'semantic_scholar' }, { status: 201 }))

    await expect(api.savePaper(paper)).resolves.toMatchObject({ paper_id: 'p1', source: 'semantic_scholar' })

    const [url, init] = lastCall()
    expect(url).toBe(`${BASE}/api/library`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body as string)).toEqual(paper)
  })

  it('uploadPaper POSTs multipart form data without a manual Content-Type', async () => {
    fetchMock.mockResolvedValue(json({ paper_id: 'upload-1' }, { status: 201 }))
    const file = new File(['%PDF-1.4'], 'paper.pdf', { type: 'application/pdf' })

    await api.uploadPaper(file)

    const [url, init] = lastCall()
    expect(url).toBe(`${BASE}/api/library/upload`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toBeUndefined() // the browser must add the multipart boundary itself
    expect(init?.body).toBeInstanceOf(FormData)
    const sent = (init!.body as FormData).get('file') as File
    expect(sent.name).toBe('paper.pdf')
    expect(sent.type).toBe('application/pdf')
  })

  it('removePaper DELETEs and resolves to undefined on 204 without reading a body', async () => {
    const response = new Response(null, { status: 204 })
    const jsonSpy = vi.spyOn(response, 'json')
    fetchMock.mockResolvedValue(response)

    await expect(api.removePaper('p1')).resolves.toBeUndefined()

    expect(lastCall()).toEqual([`${BASE}/api/library/p1`, { method: 'DELETE' }])
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['removePaper', () => api.removePaper('a/b c?#'), '/api/library/a%2Fb%20c%3F%23'],
    ['summarizePaper', () => api.summarizePaper('a/b c?#'), '/api/library/a%2Fb%20c%3F%23/summarize'],
    ['askPaper', () => api.askPaper('a/b c?#', 'q', []), '/api/library/a%2Fb%20c%3F%23/qa'],
  ])('%s escapes the paper id in the path', async (_, call, path) => {
    fetchMock.mockResolvedValue(json({}))
    await call()
    expect(lastCall()[0]).toBe(`${BASE}${path}`)
  })

  it('summarizePaper POSTs with no body and returns the summary', async () => {
    fetchMock.mockResolvedValue(json({ summary: 'Problem: ...' }))
    await expect(api.summarizePaper('upload-1')).resolves.toEqual({ summary: 'Problem: ...' })
    expect(lastCall()).toEqual([`${BASE}/api/library/upload-1/summarize`, { method: 'POST' }])
  })

  it('askPaper POSTs the question and history as JSON', async () => {
    fetchMock.mockResolvedValue(json({ answer: '28.4 BLEU' }))
    const history = [
      { role: 'user' as const, content: 'What task?' },
      { role: 'assistant' as const, content: 'Translation.' },
    ]

    await expect(api.askPaper('p1', 'What score?', history)).resolves.toEqual({ answer: '28.4 BLEU' })

    const [url, init] = lastCall()
    expect(url).toBe(`${BASE}/api/library/p1/qa`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body as string)).toEqual({ question: 'What score?', history })
  })
})

describe('error parsing', () => {
  it('uses the FastAPI detail string for HTTPExceptions (503 rate limit)', async () => {
    fetchMock.mockResolvedValue(
      json({ detail: 'Paper search is rate-limited, try again shortly' }, { status: 503, statusText: 'Service Unavailable' }),
    )
    const err = await apiError(api.searchPapers('x'))
    expect(err.status).toBe(503)
    expect(err.message).toBe('Paper search is rate-limited, try again shortly')
    expect(err.name).toBe('ApiError')
    expect(err).toBeInstanceOf(Error)
  })

  it('uses the first message of a 422 validation error list', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          detail: [
            { type: 'value_error', loc: ['body', 'question'], msg: 'Value error, Question must not be empty' },
            { type: 'too_long', loc: ['body', 'history'], msg: 'second error' },
          ],
        },
        { status: 422 },
      ),
    )
    const err = await apiError(api.askPaper('p1', ' ', []))
    expect(err.status).toBe(422)
    expect(err.message).toBe('Value error, Question must not be empty')
  })

  it('uses the detail of a 422 processing error', async () => {
    const detail = "No extractable text found. Scanned (image-only) PDFs aren't supported."
    fetchMock.mockResolvedValue(json({ detail }, { status: 422 }))
    const err = await apiError(api.uploadPaper(new File(['x'], 'a.pdf')))
    expect([err.status, err.message]).toEqual([422, detail])
  })

  it.each([
    ['a non-JSON body (proxy error page)', () => new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })],
    ['JSON without detail', () => json({ error: 'nope' }, { status: 502, statusText: 'Bad Gateway' })],
    ['an empty validation list', () => json({ detail: [] }, { status: 502, statusText: 'Bad Gateway' })],
    ['a validation item without msg', () => json({ detail: [{ loc: ['q'] }] }, { status: 502, statusText: 'Bad Gateway' })],
    ['a non-string, non-list detail', () => json({ detail: { code: 1 } }, { status: 502, statusText: 'Bad Gateway' })],
    ['an empty body', () => new Response(null, { status: 502, statusText: 'Bad Gateway' })],
  ])('falls back to the status text for %s', async (_, response) => {
    fetchMock.mockResolvedValue(response())
    const err = await apiError(api.listLibrary())
    expect([err.status, err.message]).toEqual([502, 'Bad Gateway'])
  })

  it('falls back to a generic message when there is no status text either', async () => {
    // e.g. an unhandled backend 500 whose body is plain text "Internal Server Error" over HTTP/2.
    fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500, statusText: '' }))
    const err = await apiError(api.summarizePaper('p1'))
    expect([err.status, err.message]).toEqual([500, 'Request failed with status 500'])
  })

  it.each([404, 413, 429, 504])('carries the HTTP status %i', async (status) => {
    fetchMock.mockResolvedValue(json({ detail: `status ${status}` }, { status }))
    const err = await apiError(api.listLibrary())
    expect([err.status, err.message]).toEqual([status, `status ${status}`])
  })
})

describe('network failures and cancellation', () => {
  it('reports an unreachable server as status 0', async () => {
    // What fetch throws when the server is down, or when CORS blocks a response (the browser's
    // view of the unhandled 500 from a malformed pdf_url).
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await apiError(api.summarizePaper('p1'))
    expect([err.status, err.message]).toEqual([0, UNREACHABLE])
  })

  it('treats DOMExceptions other than AbortError as network failures', async () => {
    fetchMock.mockRejectedValue(new DOMException('Network error', 'NetworkError'))
    const err = await apiError(api.listLibrary())
    expect(err.status).toBe(0)
  })

  it('passes an AbortError through unchanged, so callers can tell a cancel from a failure', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    fetchMock.mockRejectedValue(abort)
    await expect(api.searchPapers('x')).rejects.toBe(abort)
  })

  it('rejects with AbortError when the caller aborts an in-flight search', async () => {
    // A fake fetch that behaves like the real one: it never answers, but rejects on abort.
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const search = api.searchPapers('x', { signal: controller.signal })

    controller.abort()

    const err = await search.catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(DOMException)
    expect((err as DOMException).name).toBe('AbortError')
  })

  it('rejects when a 200 response is not valid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    await expect(api.listLibrary()).rejects.toThrow(SyntaxError)
  })
})

describe('API base URL', () => {
  it('uses VITE_API_BASE_URL and strips trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/v1//')
    vi.resetModules()
    const fresh = await import('../src/api')
    fetchMock.mockResolvedValue(json([]))

    await fresh.listLibrary()

    expect(lastCall()[0]).toBe('https://api.example.com/v1/api/library')
  })

  it('defaults to localhost:8000 when the variable is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.resetModules()
    const fresh = await import('../src/api')
    fetchMock.mockResolvedValue(json([]))

    await fresh.listLibrary()

    expect(lastCall()[0]).toBe(`${BASE}/api/library`)
  })
})
