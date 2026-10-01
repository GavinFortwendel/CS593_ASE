// Mirrors backend/schemas.py — keep these in sync with the Pydantic models.

export interface Paper {
  paper_id: string
  title: string
  authors: string[]
  year: number | null
  abstract: string | null // Semantic Scholar often omits abstracts
  url: string | null // best available link: open-access PDF > DOI > S2 page
  pdf_url: string | null
}

export interface LibraryPaper extends Paper {
  source: string // 'semantic_scholar' | 'upload'
  saved_at: string // ISO 8601 UTC timestamp
}

export interface SearchResponse {
  query: string
  total: number
  offset: number
  papers: Paper[]
}
