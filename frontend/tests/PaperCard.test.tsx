import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api'
import PaperCard from '../src/components/PaperCard'
import { BACKEND, deferred, makeLibraryPaper, makePaper, makeUpload } from './fixtures'

// PaperAssistant calls the API; it is only opened here, never used, but keep it offline anyway.
vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  summarizePaper: vi.fn(),
  askPaper: vi.fn(),
}))

type Props = ComponentProps<typeof PaperCard>

function renderCard(overrides: Partial<Props> = {}) {
  const props: Props = { paper: makePaper(), saved: false, ...overrides }
  render(<PaperCard {...props} />)
  return props
}

describe('PaperCard metadata', () => {
  it('links the title to the best available URL in a new tab', () => {
    renderCard()
    const link = screen.getByRole('link', { name: 'Attention Is All You Need' })
    expect(link).toHaveAttribute('href', 'https://doi.org/10.48550/arXiv.1706.03762')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows a plain title when there is no URL', () => {
    renderCard({ paper: makePaper({ url: null }) })
    expect(screen.getByRole('heading')).toHaveTextContent('Attention Is All You Need')
    expect(screen.queryByRole('link', { name: 'Attention Is All You Need' })).not.toBeInTheDocument()
  })

  it.each([
    [[], 'Unknown authors'],
    [['A One', 'B Two', 'C Three', 'D Four', 'E Five'], 'A One, B Two, C Three, D Four, E Five'],
    [['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six'], 'A One, B Two, C Three, D Four, E Five, et al.'],
  ])('formats authors %j', (authors, expected) => {
    renderCard({ paper: makePaper({ authors, year: 2017 }) })
    expect(screen.getByText(expected, { exact: false })).toHaveTextContent(`${expected}·2017`)
  })

  it('shows n.d. when the year is unknown', () => {
    renderCard({ paper: makePaper({ year: null }) })
    expect(screen.getByText('n.d.', { exact: false })).toHaveTextContent('Ashish Vaswani, Noam Shazeer·n.d.')
  })

  it('says when there is no abstract', () => {
    renderCard({ paper: makePaper({ abstract: null }) })
    expect(screen.getByText('No abstract available.')).toBeInTheDocument()
  })

  it('shows a short abstract without an expand toggle', () => {
    renderCard()
    expect(screen.getByText(makePaper().abstract!)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('expands and collapses a long abstract', () => {
    const abstract = 'word '.repeat(100).trim() // 499 chars
    renderCard({ paper: makePaper({ abstract }) })
    const text = screen.getByText(abstract)
    expect(text).toHaveClass('line-clamp-4')

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(text).not.toHaveClass('line-clamp-4')

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(text).toHaveClass('line-clamp-4')
  })

  it('links the open-access PDF', () => {
    renderCard()
    expect(screen.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://arxiv.org/pdf/1706.03762.pdf')
  })

  it('has no PDF link without an open-access PDF', () => {
    renderCard({ paper: makePaper({ pdf_url: null }) })
    expect(screen.queryByRole('link', { name: 'Open PDF' })).not.toBeInTheDocument()
  })
})

describe('PaperCard uploaded PDFs', () => {
  it('shows an upload badge, never links, and has its own empty-abstract text', () => {
    // Even if an upload somehow had URLs, they must not be linked.
    renderCard({ paper: makeUpload({ abstract: null, url: 'https://x.example', pdf_url: 'https://x.example/a.pdf' }), saved: true })
    expect(screen.getByText('Uploaded PDF')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No abstract detected in this PDF.')).toBeInTheDocument()
  })

  it('does not show the upload badge for saved search results', () => {
    renderCard({ paper: makeLibraryPaper(), saved: true })
    expect(screen.queryByText('Uploaded PDF')).not.toBeInTheDocument()
  })
})

describe('PaperCard save / remove', () => {
  it('has no action button without a handler', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Save|Remove/ })).not.toBeInTheDocument()
  })

  it('shows a saving state until the save finishes', async () => {
    const pending = deferred<void>()
    const onSave = vi.fn(() => pending.promise)
    renderCard({ onSave })

    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    pending.resolve()
    expect(await screen.findByRole('button', { name: 'Save to Library' })).toBeEnabled()
  })

  it('shows a removing state for saved papers', async () => {
    const pending = deferred<void>()
    const onRemove = vi.fn(() => pending.promise)
    renderCard({ saved: true, onRemove })

    fireEvent.click(screen.getByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled()
    pending.resolve()
    expect(await screen.findByRole('button', { name: 'Saved ✓ · Remove' })).toBeEnabled()
  })

  it('shows the error inline when saving fails, and clears it on retry', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, BACKEND.unreachable))
      .mockResolvedValueOnce(undefined)
    renderCard({ onSave })

    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(BACKEND.unreachable)
    expect(screen.getByRole('button', { name: 'Save to Library' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }))
    await screen.findByRole('button', { name: 'Save to Library' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('PaperCard AI assistant toggle', () => {
  it('is hidden for search results', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /Ask AI/ })).not.toBeInTheDocument()
  })

  it('opens and closes the assistant panel', () => {
    renderCard({ paper: makeLibraryPaper(), saved: true, showAssistant: true })
    const toggle = screen.getByRole('button', { name: 'Ask AI ✨' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent('Hide AI')
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
  })

  it('is enabled for uploads, which always have text', () => {
    renderCard({ paper: makeUpload(), saved: true, showAssistant: true })
    expect(screen.getByRole('button', { name: 'Ask AI ✨' })).toBeEnabled()
  })

  it('is disabled with an explanation when there is no text to use', () => {
    renderCard({ paper: makeLibraryPaper({ pdf_url: null }), saved: true, showAssistant: true })
    const toggle = screen.getByRole('button', { name: 'Ask AI ✨' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('title', 'No open-access PDF; upload it to use AI features')
  })
})
