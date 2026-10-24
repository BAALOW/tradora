import { upload } from '@imagekit/javascript'
import { supabase } from '../lib/supabaseClient'

/**
 * Get temporary ImageKit upload authentication
 * from the Supabase Edge Function.
 */
export async function getImageKitAuth() {
  const { data, error } = await supabase.functions.invoke('imagekit-auth')

  if (error) {
    throw new Error(error.message || 'Failed to authenticate with ImageKit.')
  }

  if (!data?.token || !data?.expire || !data?.signature || !data?.publicKey) {
    throw new Error('Invalid ImageKit authentication response.')
  }

  return data
}

/**
 * Upload a file to ImageKit.
 * Returns ImageKit's response, including url and fileId.
 *
 * @param {File} file
 * @param {Object} options
 * @param {string} options.folder
 * @param {string} options.fileName
 * @param {Function} options.onProgress
 */
export async function uploadToImageKit(
  file,
  { folder = '/tradora', fileName, onProgress } = {}
) {
  if (!(file instanceof File)) {
    throw new Error('A valid file is required.')
  }

  const auth = await getImageKitAuth()
  const safeFileName =
    fileName ||
    `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  try {
    const response = await upload({
      file,
      fileName: safeFileName,
      token: auth.token,
      signature: auth.signature,
      expire: auth.expire,
      publicKey: auth.publicKey,
      folder,
      onProgress: (event) => {
        if (onProgress && event.total) {
          onProgress((event.loaded / event.total) * 100)
        }
      },
    })

    if (!response?.url || !response?.fileId) {
      throw new Error('ImageKit did not return the image URL and file ID.')
    }

    return response
  } catch (error) {
    console.error('[TRADORA] ImageKit upload failed:', error)
    throw error
  }
}

