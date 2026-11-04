import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api'
import LibraryView from '../src/components/LibraryView'
import { BACKEND, makeLibraryPaper, makeUpload, pdfFile } from './fixtures'

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  summarizePaper: vi.fn(),
  askPaper: vi.fn(),
}))

type Props = ComponentProps<typeof LibraryView>

function renderLibrary(overrides: Partial<Props> = {}) {
  const props: Props = {
    status: 'success',
    papers: [],
    error: null,
    onRetry: vi.fn(),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onUpload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  const view = render(<LibraryView {...props} />)
  return { props, ...view }
}

describe('LibraryView', () => {
  it('shows skeletons and no upload area while loading', () => {
    renderLibrary({ status: 'loading' })
    const region = screen.getByLabelText('Loading library')
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.children).toHaveLength(2)
    expect(screen.queryByText('Upload a PDF')).not.toBeInTheDocument()
  })

  it('shows the load error and retries', () => {
    const { props } = renderLibrary({ status: 'error', error: new ApiError(0, BACKEND.unreachable) })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByRole('heading')).toHaveTextContent('Could not load your library')
    expect(alert).toHaveTextContent(BACKEND.unreachable)

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(props.onRetry).toHaveBeenCalledOnce()
  })

  it('shows non-Error failures as text', () => {
    renderLibrary({ status: 'error', error: 'weird failure' })
    expect(screen.getByRole('alert')).toHaveTextContent('weird failure')
  })

  it('explains the empty library and still offers upload', () => {
    renderLibrary()
    expect(screen.getByText('Your library is empty. Save papers from search results or upload a PDF.')).toBeInTheDocument()
    expect(screen.getByText('Upload a PDF')).toBeInTheDocument()
  })

  it.each([
    [1, '1 saved paper'],
    [2, '2 saved papers'],
  ])('counts %i paper(s)', (n, text) => {
    const papers = Array.from({ length: n }, (_, i) => makeLibraryPaper({ paper_id: `p${i}` }))
    renderLibrary({ papers })
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(n)
  })

  it('renders library cards in the given order with remove and AI actions', () => {
    const papers = [makeUpload({ title: 'Uploaded One' }), makeLibraryPaper({ paper_id: 's2', title: 'Saved Two' })]
    renderLibrary({ papers })

    const [first, second] = screen.getAllByRole('article')
    expect(within(first).getByRole('heading')).toHaveTextContent('Uploaded One')
    expect(within(first).getByText('Uploaded PDF')).toBeInTheDocument()
    expect(within(second).getByRole('heading')).toHaveTextContent('Saved Two')
    for (const card of [first, second]) {
      expect(within(card).getByRole('button', { name: 'Saved ✓ · Remove' })).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: 'Ask AI ✨' })).toBeEnabled()
    }
  })

  it('removes a paper by id', async () => {
    const papers = [makeLibraryPaper({ paper_id: 'a' }), makeLibraryPaper({ paper_id: 'b' })]
    const { props } = renderLibrary({ papers })
    const second = screen.getAllByRole('article')[1]

    fireEvent.click(within(second).getByRole('button', { name: 'Saved ✓ · Remove' }))

    expect(props.onRemove).toHaveBeenCalledExactlyOnceWith('b')
    // The parent drops the paper from `papers`; this view only waits for the call to finish.
    expect(await within(second).findByRole('button', { name: 'Saved ✓ · Remove' })).toBeEnabled()
    expect(within(second).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('passes uploads through to the handler', async () => {
    const { props, container } = renderLibrary()
    const file = pdfFile()
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(props.onUpload).toHaveBeenCalledExactlyOnceWith(file)
    expect(screen.getByText('Extracting text…')).toBeInTheDocument()
    expect(await screen.findByText('Upload a PDF')).toBeInTheDocument()
  })
})
