import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../src/api'
import { ApiError } from '../src/api'
import PaperAssistant from '../src/components/PaperAssistant'
import type { QAResponse, SummaryResponse } from '../src/types'
import { BACKEND, deferred } from './fixtures'

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  summarizePaper: vi.fn(),
  askPaper: vi.fn(),
}))

const summarizePaper = vi.mocked(api.summarizePaper)
const askPaper = vi.mocked(api.askPaper)
const PAPER_ID = 'upload-123'

function setup() {
  render(<PaperAssistant paperId={PAPER_ID} />)
  const input = screen.getByPlaceholderText('Ask a question about this paper…')
  const askButton = screen.getByRole('button', { name: 'Ask' })
  const ask = (question: string) => {
    fireEvent.change(input, { target: { value: question } })
    fireEvent.click(askButton)
  }
  return { input, askButton, ask }
}

describe('PaperAssistant summary', () => {
  it('summarizes the paper, with a loading state', async () => {
    const pending = deferred<SummaryResponse>()
    summarizePaper.mockReturnValue(pending.promise)
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(summarizePaper).toHaveBeenCalledExactlyOnceWith(PAPER_ID)
    expect(screen.getByRole('button', { name: 'Summarizing…' })).toBeDisabled()
    expect(screen.getByText(/This can take 10–30 seconds/)).toBeInTheDocument()

    pending.resolve({ summary: 'Problem: translation.\nApproach: attention only.' })

    expect(await screen.findByRole('button', { name: 'Regenerate' })).toBeEnabled()
    // Line breaks from the model are preserved (whitespace-pre-wrap).
    const summary = screen.getByText(/Problem: translation\./)
    expect(summary.textContent).toBe('Problem: translation.\nApproach: attention only.')
    expect(summary).toHaveClass('whitespace-pre-wrap')
    expect(screen.queryByText(/This can take/)).not.toBeInTheDocument()
  })

  it.each([
    ['no open-access PDF (422)', new ApiError(422, BACKEND.noOpenAccessPdf), BACKEND.noOpenAccessPdf],
    ['missing API key (503)', new ApiError(503, BACKEND.noApiKey), BACKEND.noApiKey],
    ['OpenAI rate limit (429)', new ApiError(429, BACKEND.llmRateLimited), BACKEND.llmRateLimited],
    ['unexpected AI failure (502)', new ApiError(502, 'The AI request failed unexpectedly.'), 'The AI request failed unexpectedly.'],
    // The malformed-pdf_url backend bug: its unhandled 500 lacks CORS headers, so the browser
    // reports a network failure and the user is told the server is down.
    ['unhandled backend 500 (seen by the browser)', new ApiError(0, BACKEND.unreachable), BACKEND.unreachable],
    ['unhandled backend 500 (with CORS)', new ApiError(500, 'Internal Server Error'), 'Internal Server Error'],
  ])('shows the error for %s', async (_, error, message) => {
    summarizePaper.mockRejectedValue(error)
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
  })

  it('clears a previous error after a successful retry', async () => {
    summarizePaper
      .mockRejectedValueOnce(new ApiError(503, BACKEND.noApiKey))
      .mockResolvedValueOnce({ summary: 'Fine now.' })
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByText('Fine now.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('regenerates and replaces the summary', async () => {
    summarizePaper.mockResolvedValueOnce({ summary: 'First.' }).mockResolvedValueOnce({ summary: 'Second.' })
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))

    expect(await screen.findByText('Second.')).toBeInTheDocument()
    expect(screen.queryByText('First.')).not.toBeInTheDocument()
    expect(summarizePaper).toHaveBeenCalledTimes(2)
  })
})

describe('PaperAssistant Q&A', () => {
  it('offers example questions and disables Ask for empty input', () => {
    const { input, askButton } = setup()
    expect(screen.getByRole('button', { name: 'What datasets are used?' })).toBeInTheDocument()
    expect(askButton).toBeDisabled()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(askButton).toBeDisabled()
    expect(input).toHaveAttribute('maxLength', '2000')
  })

  it('shows the pending question, then the answer', async () => {
    const pending = deferred<QAResponse>()
    askPaper.mockReturnValue(pending.promise)
    const { ask, input, askButton } = setup()

    ask('  What BLEU score does it reach?  ')

    expect(askPaper).toHaveBeenCalledExactlyOnceWith(PAPER_ID, 'What BLEU score does it reach?', [])
    expect(screen.getByText('What BLEU score does it reach?')).toBeInTheDocument()
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(askButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'What datasets are used?' })).not.toBeInTheDocument()

    pending.resolve({ answer: '28.4 BLEU on WMT 2014 English-German.' })

    expect(await screen.findByText('28.4 BLEU on WMT 2014 English-German.')).toBeInTheDocument()
    expect(screen.getByText('What BLEU score does it reach?')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
  })

  it('asks an example question when clicked', async () => {
    askPaper.mockResolvedValue({ answer: 'WMT 2014.' })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'What datasets are used?' }))
    expect(askPaper).toHaveBeenCalledWith(PAPER_ID, 'What datasets are used?', [])
    expect(await screen.findByText('WMT 2014.')).toBeInTheDocument()
  })

  it('sends earlier turns as history with follow-up questions', async () => {
    askPaper.mockResolvedValueOnce({ answer: 'Answer one.' }).mockResolvedValueOnce({ answer: 'Answer two.' })
    const { ask } = setup()

    ask('Question one?')
    await screen.findByText('Answer one.')
    ask('Question two?')
    await screen.findByText('Answer two.')

    expect(askPaper).toHaveBeenLastCalledWith(PAPER_ID, 'Question two?', [
      { role: 'user', content: 'Question one?' },
      { role: 'assistant', content: 'Answer one.' },
    ])
    const bubbles = ['Question one?', 'Answer one.', 'Question two?', 'Answer two.'].map((t) => screen.getByText(t))
    for (let i = 1; i < bubbles.length; i++) {
      expect(bubbles[i - 1].compareDocumentPosition(bubbles[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it.each([
    ['no open-access PDF (422)', new ApiError(422, BACKEND.noOpenAccessPdf)],
    ['missing API key (503)', new ApiError(503, BACKEND.noApiKey)],
    ['unhandled backend 500 (seen by the browser)', new ApiError(0, BACKEND.unreachable)],
  ])('keeps the question for retry after %s', async (_, error) => {
    askPaper.mockRejectedValue(error)
    const { ask, input } = setup()

    ask('Why does it work?')

    expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
    expect(input).toHaveValue('Why does it work?')
    // The failed question isn't left in the conversation.
    expect(screen.queryByText('Why does it work?', { selector: 'div' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What datasets are used?' })).toBeInTheDocument()
  })

  it('clears the chat error when the retry succeeds', async () => {
    askPaper.mockRejectedValueOnce(new ApiError(503, BACKEND.noApiKey)).mockResolvedValueOnce({ answer: 'OK.' })
    const { askButton } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'What datasets are used?' }))
    await screen.findByRole('alert')

    fireEvent.click(askButton) // question was restored into the input

    expect(await screen.findByText('OK.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
