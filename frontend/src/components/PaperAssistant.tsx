import { useState, type FormEvent } from 'react'
import { askPaper, summarizePaper } from '../api'
import type { ChatMessage } from '../types'

const EXAMPLE_QUESTIONS = [
  'What problem does this paper address?',
  'What is the main idea of the proposed approach?',
  'What datasets are used?',
  'What are the major limitations?',
  'How does this method compare with the baselines?',
]

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface Props {
  paperId: string
}

/** Summary and Q&A for one library paper. State is in memory only, so closing the panel clears it. */
export default function PaperAssistant({ paperId }: Props) {
  const [summary, setSummary] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  // The question waiting for an answer, shown in the chat until the answer arrives.
  const [pending, setPending] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)

  async function handleSummarize() {
    setSummarizing(true)
    setSummaryError(null)
    try {
      const res = await summarizePaper(paperId)
      setSummary(res.summary)
    } catch (err) {
      setSummaryError(errorText(err))
    } finally {
      setSummarizing(false)
    }
  }

  async function ask(question: string) {
    question = question.trim()
    if (!question || pending) return
    setPending(question)
    setInput('')
    setChatError(null)
    try {
      const res = await askPaper(paperId, question, messages)
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: res.answer },
      ])
    } catch (err) {
      // Put the question back in the box so it can be retried.
      setInput(question)
      setChatError(errorText(err))
    } finally {
      setPending(null)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    ask(input)
  }

  return (
    <div className="mt-4 space-y-5 border-t border-slate-200 pt-4">
      {/* Summary */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <button
            type="button"
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {summarizing ? 'Summarizing…' : summary ? 'Regenerate' : 'Summarize'}
          </button>
          {summarizing && (
            <span className="text-xs text-slate-500">
              This can take 10–30 seconds (longer the first time for saved papers, while the PDF
              is fetched).
            </span>
          )}
        </div>
        {summaryError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {summaryError}
          </p>
        )}
        {summary && (
          <div className="mt-2 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200">
            {summary}
          </div>
        )}
      </section>

      {/* Q&A */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900">Ask about this paper</h3>

        {messages.length === 0 && !pending && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {(messages.length > 0 || pending) && (
          <div className="mt-2 space-y-2">
            {messages.map((m, i) => (
              <ChatBubble key={i} message={m} />
            ))}
            {pending && (
              <>
                <ChatBubble message={{ role: 'user', content: pending }} />
                <p className="text-xs text-slate-500" aria-live="polite">
                  Thinking…
                </p>
              </>
            )}
          </div>
        )}

        {chatError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {chatError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this paper…"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending !== null}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </section>
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}
