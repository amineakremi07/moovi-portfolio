'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ClubLogo } from '@/components/club/club-logo'
import { Button } from '@/components/ui/button'
import { createLogoUploadUrl, setClubLogo } from '@/lib/actions/club-profile'
import { GALLERY_BUCKET, GALLERY_TYPES, validateGalleryFile } from '@/lib/club-profile'
import { GALLERY_MAX_RAW_BYTES, prepareGalleryImage } from '@/lib/image-resize'
import { createClient } from '@/lib/supabase/client'

/**
 * The club's logo: shown as a round avatar on its card in "Tous les clubs" and in its page header.
 * Uploaded like a gallery photo (shrunk in the browser, then a one-time signed URL, see
 * lib/actions/club-profile.ts); saved, replaced or removed at once.
 */
export function LogoManager({ initialUrl, clubName }: { initialUrl: string | null; clubName: string }) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [url, setUrl] = React.useState(initialUrl)
  const [busy, setBusy] = React.useState(false)

  const upload = async (picked: File | undefined) => {
    if (!picked || busy) return
    const early = validateGalleryFile({ type: picked.type, size: Math.min(picked.size, 1), name: picked.name })
    if (early) return void toast.error(early)
    if (picked.size > GALLERY_MAX_RAW_BYTES) return void toast.error(`${picked.name} est trop volumineux (30 Mo maximum).`)

    setBusy(true)
    try {
      const file = await prepareGalleryImage(picked)
      const problem = validateGalleryFile(file)
      if (problem) return void toast.error(problem)

      const prepared = await createLogoUploadUrl({ type: file.type, size: file.size, name: file.name })
      if (!prepared.ok) return void toast.error(prepared.message)
      const { error } = await createClient()
        .storage.from(GALLERY_BUCKET)
        .uploadToSignedUrl(prepared.ticket.path, prepared.ticket.token, file, { contentType: file.type })
      if (error) return void toast.error('Impossible de téléverser le logo. Veuillez réessayer.')

      const saved = await setClubLogo(prepared.ticket.path)
      if (!saved.ok) return void toast.error(saved.message)
      setUrl(saved.url)
      toast.success('Logo enregistré')
      router.refresh()
    } catch {
      toast.error('Le téléversement a échoué. Vérifiez votre connexion et réessayez.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    const result = await setClubLogo(null)
    setBusy(false)
    if (!result.ok) return void toast.error(result.message)
    setUrl(null)
    toast.success('Logo retiré')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <ClubLogo url={url} name={clubName || '?'} sizes="4rem" className="size-16 text-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-[#645757]">Une image carrée (JPG, PNG ou WebP, 5 Mo maximum), affichée en rond sur votre carte et votre page.</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={Object.keys(GALLERY_TYPES).join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void upload(e.target.files?.[0])}
            data-testid="logo-input"
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {url ? 'Changer le logo' : 'Ajouter un logo'}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 aria-hidden />
              Retirer
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
