import { useRef, useState, type DragEvent } from 'react'

// Mirrors MAX_UPLOAD_BYTES in backend/config.py; checked here only to fail fast.
const MAX_UPLOAD_MB = 20

interface Props {
  onUpload: (file: File) => Promise<void>
}

export default function UploadPdf({ onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file || uploading) return
    setError(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`PDF is larger than ${MAX_UPLOAD_MB} MB.`)
      return
    }
    setUploading(true)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      // Reset so choosing the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault() // required for onDrop to fire
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        // Not `disabled`: disabled elements ignore drag events, so a drop mid-upload would fall
        // through to the browser and navigate away to the PDF. handleFile ignores it instead.
        aria-disabled={uploading}
        className={`w-full rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors aria-disabled:cursor-wait ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <p className="pointer-events-none text-sm font-medium text-slate-700">
          {uploading ? 'Extracting text…' : 'Upload a PDF'}
        </p>
        {!uploading && (
          <p className="pointer-events-none mt-1 text-xs text-slate-500">
            Drag and drop a paper here, or click to choose a file (max {MAX_UPLOAD_MB} MB)
          </p>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
