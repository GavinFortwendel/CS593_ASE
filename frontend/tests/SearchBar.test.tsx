import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SearchBar from '../src/components/SearchBar'

function setup(loading = false) {
  const onSearch = vi.fn()
  const view = render(<SearchBar onSearch={onSearch} loading={loading} />)
  return { onSearch, input: screen.getByRole('searchbox', { name: 'Search papers' }), ...view }
}

describe('SearchBar', () => {
  it('starts empty with the submit button disabled', () => {
    const { input } = setup()
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('submits the trimmed query', () => {
    const { input, onSearch } = setup()
    fireEvent.change(input, { target: { value: '  graph neural networks  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('graph neural networks')
  })

  it('submits with the Enter key (form submit)', () => {
    const { input, onSearch } = setup()
    fireEvent.change(input, { target: { value: 'transformers' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSearch).toHaveBeenCalledWith('transformers')
  })

  it('never submits a whitespace-only query', () => {
    const { input, onSearch } = setup()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    fireEvent.submit(input.closest('form')!)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('shows a loading label and disables the button while searching', () => {
    const { input } = setup(true)
    fireEvent.change(input, { target: { value: 'transformers' } })
    const button = screen.getByRole('button', { name: 'Searching…' })
    expect(button).toBeDisabled()
  })
})
