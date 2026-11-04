import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

/** Waits until the upload has finished and the drop zone is idle again. */
async function waitForIdle(dropZone: HTMLElement) {
  await waitFor(() => expect(dropZone).toHaveAttribute('aria-disabled', 'false'))
  expect(screen.getByText('Upload a PDF')).toBeInTheDocument()
}

const HIGHLIGHT = ['border-indigo-400', 'bg-indigo-50']
const IDLE = ['border-slate-300', 'bg-white']

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

  it('uploads a dropped PDF', async () => {
    const { dropZone, onUpload } = setup()
    const file = pdfFile()
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })
    expect(onUpload).toHaveBeenCalledExactlyOnceWith(file)
    await waitForIdle(dropZone)
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
  ])('accepts %s (type %j) as a PDF', async (name, type) => {
    const { choose, onUpload, dropZone } = setup()
    choose(pdfFile(name, type))
    expect(onUpload).toHaveBeenCalledOnce()
    await waitForIdle(dropZone)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects files over 20 MB before uploading', () => {
    const { choose, onUpload } = setup()
    choose(pdfFile('big.pdf', 'application/pdf', 20 * MB + 1))
    expect(screen.getByRole('alert')).toHaveTextContent('PDF is larger than 20 MB.')
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('accepts a file of exactly 20 MB', async () => {
    const { choose, onUpload, dropZone } = setup()
    choose(pdfFile('limit.pdf', 'application/pdf', 20 * MB))
    expect(onUpload).toHaveBeenCalledOnce()
    await waitForIdle(dropZone)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  describe('drag and drop highlighting', () => {
    it('highlights the drop zone while a file is dragged over it', () => {
      const { dropZone } = setup()
      expect(dropZone).toHaveClass(...IDLE)

      fireEvent.dragOver(dropZone)
      expect(dropZone).toHaveClass(...HIGHLIGHT)
      expect(dropZone).not.toHaveClass(...IDLE)

      fireEvent.dragLeave(dropZone)
      expect(dropZone).toHaveClass(...IDLE)
      expect(dropZone).not.toHaveClass(...HIGHLIGHT)
    })

    it('prevents the browser default on dragover so drops are delivered', () => {
      const { dropZone } = setup()
      // fireEvent returns false when a handler called preventDefault().
      expect(fireEvent.dragOver(dropZone)).toBe(false)
    })

    it('prevents the browser from opening the dropped file', async () => {
      const { dropZone } = setup()
      expect(fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile()] } })).toBe(false)
      await waitForIdle(dropZone)
    })

    it('removes the highlight when the file is dropped', async () => {
      const { dropZone } = setup()
      fireEvent.dragOver(dropZone)
      fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile()] } })
      expect(dropZone).toHaveClass(...IDLE)
      await waitForIdle(dropZone)
    })

    it('removes the highlight and shows an error when a non-PDF is dropped', () => {
      const { dropZone, onUpload } = setup()
      fireEvent.dragOver(dropZone)
      fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile('photo.jpg', 'image/jpeg')] } })
      expect(dropZone).toHaveClass(...IDLE)
      expect(screen.getByRole('alert')).toHaveTextContent('Please choose a PDF file.')
      expect(onUpload).not.toHaveBeenCalled()
    })

    it('does nothing when the drop carries no file', () => {
      const { dropZone, onUpload } = setup()
      fireEvent.dragOver(dropZone)
      fireEvent.drop(dropZone, { dataTransfer: { files: [] } })
      expect(dropZone).toHaveClass(...IDLE)
      expect(onUpload).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('still highlights during an upload, but ignores the drop', async () => {
      const pending = deferred<void>()
      const { choose, dropZone, onUpload } = setup(vi.fn(() => pending.promise))
      choose(pdfFile('first.pdf'))

      fireEvent.dragOver(dropZone)
      expect(dropZone).toHaveClass(...HIGHLIGHT)
      // The default is still prevented: a drop mid-upload must not navigate the tab to the PDF.
      expect(fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile('second.pdf')] } })).toBe(false)
      expect(dropZone).toHaveClass(...IDLE)
      expect(onUpload).toHaveBeenCalledOnce()

      pending.resolve()
      await waitForIdle(dropZone)
    })
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
