import { useState } from 'react'
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { uploadToImageKit } from '../services/imagekitService'

export default function ImageKitTest() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedUrl, setUploadedUrl] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) return

    setFile(selectedFile)
    setUploadedUrl('')
    setError('')
    setProgress(0)
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an image first.')
      return
    }

    setUploading(true)
    setError('')
    setUploadedUrl('')
    setProgress(0)

    try {
      const response = await uploadToImageKit(file, {
        folder: '/tradora/test',
        fileName: file.name,
        onProgress: (value) => {
          setProgress(Math.round(value))
        },
      })

      setUploadedUrl(response.url)
      setProgress(100)
    } catch (err) {
      console.error(err)

      setError(
        err?.message ||
          'Upload failed. Please check your ImageKit and Supabase setup.'
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-card">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary">
              ImageKit Upload Test
            </h1>

            <p className="mt-1 text-sm text-text-secondary">
              Test TRADORA image upload before connecting it to Journal.
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface p-8 transition hover:border-brand">
            <Upload className="mb-3 h-8 w-8 text-brand" />

            <span className="text-sm font-semibold text-text-primary">
              Select an image
            </span>

            <span className="mt-1 text-xs text-text-muted">
              PNG, JPG, JPEG, WEBP
            </span>

            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {file && (
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">
                Selected file
              </p>

              <p className="mt-1 break-all text-sm text-text-secondary">
                {file.name}
              </p>

              <p className="mt-1 text-xs text-text-muted">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          {uploading && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-text-secondary">
                  Uploading to ImageKit...
                </span>

                <span className="font-semibold text-text-primary">
                  {progress}%
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Image
              </>
            )}
          </button>

          {uploadedUrl && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />

                <p className="text-sm font-semibold">
                  Upload successful!
                </p>
              </div>

              <img
                src={uploadedUrl}
                alt="Uploaded"
                className="mt-4 max-h-80 w-full rounded-xl object-contain"
              />

              <div className="mt-4">
                <p className="text-xs font-semibold text-green-700">
                  ImageKit URL
                </p>

                <p className="mt-1 break-all text-xs text-green-800">
                  {uploadedUrl}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2 text-red-700">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" />

                <div>
                  <p className="text-sm font-semibold">
                    Upload failed
                  </p>

                  <p className="mt-1 break-words text-xs">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}