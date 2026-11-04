import type { LibraryPaper, Paper, SearchResponse } from '../src/types'

export function makePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    paper_id: 'p1',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    year: 2017,
    abstract: 'The dominant sequence transduction models are based on recurrent networks.',
    url: 'https://doi.org/10.48550/arXiv.1706.03762',
    pdf_url: 'https://arxiv.org/pdf/1706.03762.pdf',
    ...overrides,
  }
}

export function makeLibraryPaper(overrides: Partial<LibraryPaper> = {}): LibraryPaper {
  return {
    ...makePaper(),
    source: 'semantic_scholar',
    saved_at: '2026-11-01T12:00:00Z',
    ...overrides,
  }
}

export function makeUpload(overrides: Partial<LibraryPaper> = {}): LibraryPaper {
  return makeLibraryPaper({
    paper_id: 'upload-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    source: 'upload',
    title: 'My Uploaded Paper',
    url: null,
    pdf_url: null,
    ...overrides,
  })
}

export function makeSearchResponse(papers: Paper[], overrides: Partial<SearchResponse> = {}): SearchResponse {
  return { query: 'transformers', total: papers.length, offset: 0, papers, ...overrides }
}

/** A promise the test resolves or rejects by hand, to observe loading states. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function pdfFile(name = 'paper.pdf', type = 'application/pdf', size?: number): File {
  const file = new File(['%PDF-1.4 test'], name, { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}

// Messages exactly as the backend sends them, so the tests show what users really see.
export const BACKEND = {
  searchRateLimited: 'Paper search is rate-limited, try again shortly',
  searchFailed: 'Paper search failed: Semantic Scholar returned 500',
  noOpenAccessPdf:
    'This paper has no open-access PDF. Download the PDF yourself and upload it in the Library tab instead.',
  noApiKey: 'OPENAI_API_KEY is not set in .env, so AI features are disabled.',
  llmRateLimited: 'OpenAI rate limit or quota exceeded. Wait a moment and try again.',
  scannedPdf: "No extractable text found. Scanned (image-only) PDFs aren't supported.",
  tooLarge: 'PDF is larger than 20 MB',
  // What api.ts produces when fetch itself fails. An unhandled backend 500 (e.g. the malformed
  // pdf_url bug) has no CORS headers, so the browser blocks it and fetch fails exactly like this.
  unreachable: 'Cannot reach the server. Is the backend running on port 8000?',
}
