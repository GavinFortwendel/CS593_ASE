import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api'
import UploadPdf from '../src/components/UploadPdf'
import { BACKEND, deferred, pdfFile } from './fixtures'

const MB = 1024 * 1024

function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  const { container } = render(<UploadPdf onUpload={onUpload} />)
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const dropZone = screen.getByRole('button', { name: /Upload a PDF/ })
  const choose = (file: File) => fireEvent.change(input, { target: { files: [file] } })
  return { onUpload, input, dropZone, choose }
}

describe('UploadPdf', () => {
  it('shows the idle prompt and accepts only PDFs in the file picker', () => {
    const { input } = setup()
    expect(screen.getByText('Upload a PDF')).toBeInTheDocument()
    expect(screen.getByText('Drag and drop a paper here, or click to choose a file (max 20 MB)')).toBeInTheDocument()
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf')
  })

  it('opens the file picker when clicked', () => {
    const { input, dropZone } = setup()
    const click = vi.spyOn(input, 'click')
    fireEvent.click(dropZone)
    expect(click).toHaveBeenCalledOnce()
  })

  it('uploads a chosen PDF and shows progress until done', async () => {
    const pending = deferred<void>()
    const { choose, onUpload, dropZone } = setup(vi.fn(() => pending.promise))
    const file = pdfFile()

    choose(file)

    expect(onUpload).toHaveBeenCalledExactlyOnceWith(file)
    expect(screen.getByText('Extracting text…')).toBeInTheDocument()
    expect(dropZone).toHaveAttribute('aria-disabled', 'true')

    pending.resolve()
    expect(await screen.findByText('Upload a PDF')).toBeInTheDocument()
    expect(dropZone).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uploads a dropped PDF', () => {
    const { dropZone, onUpload } = setup()
    const file = pdfFile()
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
    expect(onUpload).toHaveBeenCalledExactlyOnceWith(file)
  })

  it('ignores drops and clicks while an upload is running', () => {
    const pending = deferred<void>()
    const { choose, dropZone, input, onUpload } = setup(vi.fn(() => pending.promise))
    choose(pdfFile('first.pdf'))
    const click = vi.spyOn(input, 'click')

    fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile('second.pdf')] } })
    fireEvent.click(dropZone)

    expect(onUpload).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })

  it.each([
    ['notes.txt', 'text/plain'],
    ['image.png', 'image/png'],
  ])('rejects %s without uploading', (name, type) => {
    const { choose, onUpload } = setup()
    choose(pdfFile(name, type))
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a PDF file.')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it.each([
    ['PAPER.PDF', ''], // some systems report no MIME type
    ['download', 'application/pdf'],
  ])('accepts %s (type %j) as a PDF', (name, type) => {
    const { choose, onUpload } = setup()
    choose(pdfFile(name, type))
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it('rejects files over 20 MB before uploading', () => {
    const { choose, onUpload } = setup()
    choose(pdfFile('big.pdf', 'application/pdf', 20 * MB + 1))
    expect(screen.getByRole('alert')).toHaveTextContent('PDF is larger than 20 MB.')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('accepts a file of exactly 20 MB', () => {
    const { choose, onUpload } = setup()
    choose(pdfFile('limit.pdf', 'application/pdf', 20 * MB))
    expect(onUpload).toHaveBeenCalledOnce()
  })

  it.each([
    [new ApiError(422, BACKEND.scannedPdf), BACKEND.scannedPdf],
    [new ApiError(422, 'This PDF is password-protected.'), 'This PDF is password-protected.'],
    [new ApiError(413, BACKEND.tooLarge), BACKEND.tooLarge],
    [new ApiError(400, 'File must be a PDF'), 'File must be a PDF'],
    [new ApiError(0, BACKEND.unreachable), BACKEND.unreachable],
  ])('shows the backend error %s', async (error, message) => {
    const { choose } = setup(vi.fn().mockRejectedValue(error))
    choose(pdfFile())
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByText('Upload a PDF')).toBeInTheDocument() // back to idle, can retry
  })

  it('clears the previous error on the next attempt', async () => {
    const { choose } = setup(vi.fn().mockResolvedValue(undefined))
    choose(pdfFile('notes.txt', 'text/plain'))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    choose(pdfFile())
    await screen.findByText('Upload a PDF')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
