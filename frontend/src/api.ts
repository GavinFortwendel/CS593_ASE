import type { LibraryPaper, Paper, SearchResponse } from './types'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '')

/** Error from the backend. `status` is the HTTP status, or 0 if the server couldn't be reached. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// FastAPI errors look like { detail: "..." } for HTTPException,
// or { detail: [{ msg: "...", ... }] } for 422 validation errors.
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return body.detail[0].msg
  } catch {
    // Non-JSON body (e.g. a proxy error page) — fall through.
  }
  return res.statusText || `Request failed with status ${res.status}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (err) {
    // Let callers distinguish a deliberate cancel from a real failure.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'Cannot reach the server. Is the backend running on port 8000?')
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
  if (res.status === 204) return undefined as T // No Content (e.g. DELETE) has no JSON body
  return res.json() as Promise<T>
}

export function searchPapers(
  q: string,
  { limit = 10, offset = 0, signal }: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) })
  return request<SearchResponse>(`/api/search?${params}`, { signal })
}

export function listLibrary(): Promise<LibraryPaper[]> {
  return request<LibraryPaper[]>('/api/library')
}

/** Idempotent: saving an already-saved paper returns the existing entry. */
export function savePaper(paper: Paper): Promise<LibraryPaper> {
  return request<LibraryPaper>('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paper),
  })
}

/** Uploads a PDF; the backend extracts its text and metadata and adds it to the library. */
export function uploadPaper(file: File): Promise<LibraryPaper> {
  const form = new FormData()
  form.append('file', file)
  // No Content-Type header: the browser sets multipart/form-data with the boundary itself.
  return request<LibraryPaper>('/api/library/upload', { method: 'POST', body: form })
}

export function removePaper(paperId: string): Promise<void> {
  return request<void>(`/api/library/${encodeURIComponent(paperId)}`, { method: 'DELETE' })
}
