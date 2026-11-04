// Adds jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...) to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'

// React reports a state update that happens after a test stopped waiting (e.g. a promise that
// resolves once the assertions are done) as an act() warning on console.error. Vitest hides the
// console output of passing tests, so these warnings are easy to miss. Fail the test instead.
const originalConsoleError = console.error
let actWarnings: string[] = []

beforeEach(() => {
  actWarnings = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ')
    if (message.includes('not wrapped in act')) actWarnings.push(message.split('\n')[0])
    else originalConsoleError(...args)
  })
})

afterEach(() => {
  cleanup()
  // Mocked api.ts functions keep their implementations otherwise; every test sets its own.
  vi.resetAllMocks()
  vi.restoreAllMocks()
  expect(actWarnings, 'React act() warnings: await the final UI state in this test').toEqual([])
})
