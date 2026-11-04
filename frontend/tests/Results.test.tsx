import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api'
import Results from '../src/components/Results'
import { BACKEND, makePaper, makeSearchResponse } from './fixtures'

type Props = ComponentProps<typeof Results>

function renderResults(overrides: Partial<Props> = {}) {
  const props: Props = {
    status: 'success',
    query: 'transformers',
    data: null,
    error: null,
    onRetry: vi.fn(),
    savedIds: new Set(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  render(<Results {...props} />)
  return props
}

describe('Results', () => {
  it('prompts for a search before the first query', () => {
    renderResults({ status: 'idle' })
    expect(screen.getByText('Search Semantic Scholar to find research papers.')).toBeInTheDocument()
  })

  it('shows skeleton cards while loading', () => {
    renderResults({ status: 'loading' })
    const region = screen.getByLabelText('Loading results')
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.children).toHaveLength(3)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('lists papers with a result count', () => {
    const papers = [makePaper({ paper_id: 'a', title: 'Paper A' }), makePaper({ paper_id: 'b', title: 'Paper B' })]
    renderResults({ data: makeSearchResponse(papers, { total: 1234 }) })

    expect(
      screen.getByText(`Showing 2 of ${(1234).toLocaleString()} results for “transformers”`),
    ).toBeInTheDocument()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByRole('heading')).toHaveTextContent('Paper A')
    expect(within(cards[1]).getByRole('heading')).toHaveTextContent('Paper B')
  })

  it('says when nothing matched', () => {
    renderResults({ query: 'zzzz', data: makeSearchResponse([], { query: 'zzzz' }) })
    expect(screen.getByText('No papers found for “zzzz”.')).toBeInTheDocument()
  })

  it('marks papers that are already saved', () => {
    const papers = [makePaper({ paper_id: 'saved' }), makePaper({ paper_id: 'new' })]
    renderResults({ data: makeSearchResponse(papers), savedIds: new Set(['saved']) })
    const [savedCard, newCard] = screen.getAllByRole('article')
    expect(within(savedCard).getByRole('button', { name: 'Saved ✓ · Remove' })).toBeInTheDocument()
    expect(within(newCard).getByRole('button', { name: 'Save to Library' })).toBeInTheDocument()
  })

  it('saves the clicked paper and removes saved ones by id', () => {
    const papers = [makePaper({ paper_id: 'saved' }), makePaper({ paper_id: 'new' })]
    const props = renderResults({ data: makeSearchResponse(papers), savedIds: new Set(['saved']) })

    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(props.onSave).toHaveBeenCalledExactlyOnceWith(papers[1])
    expect(props.onRemove).toHaveBeenCalledExactlyOnceWith('saved')
  })

  describe('errors', () => {
    it.each([
      [new ApiError(503, BACKEND.searchRateLimited), 'Search is rate-limited', 'Semantic Scholar is throttling requests. Wait a few seconds and retry.'],
      [new ApiError(504, 'Paper search timed out, try again'), 'Search timed out', 'Semantic Scholar took too long to respond. Try again.'],
      [new ApiError(502, BACKEND.searchFailed), 'Paper search failed', BACKEND.searchFailed],
      [new ApiError(0, BACKEND.unreachable), 'Cannot reach the server', 'Make sure the backend is running on port 8000.'],
      [new ApiError(500, 'Internal Server Error'), 'Error 500', 'Internal Server Error'],
      [new ApiError(422, 'Input should be greater than or equal to 1'), 'Error 422', 'Input should be greater than or equal to 1'],
      [new TypeError('boom'), 'Something went wrong', 'TypeError: boom'],
    ])('shows a friendly message for %s', (error, title, detail) => {
      renderResults({ status: 'error', error })
      const alert = screen.getByRole('alert')
      expect(within(alert).getByRole('heading')).toHaveTextContent(title)
      expect(alert).toHaveTextContent(detail)
    })

    it('retries on request', () => {
      const props = renderResults({ status: 'error', error: new ApiError(503, BACKEND.searchRateLimited) })
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(props.onRetry).toHaveBeenCalledOnce()
    })
  })
})
