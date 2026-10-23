import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { LOGO_SIZE } from '@/components/brand/brand-mark'
import { BRAND_NAME } from '@/lib/brand'

/** Shared Open Graph card size (the size social networks crop to). */
export const OG_SIZE = { width: 1200, height: 630 }

const LOGO_HEIGHT = 72

/** The light logo (Bone Linen wordmark) as a data URI: Satori draws images from bytes, not from the site. */
export async function loadOgLogo(): Promise<string> {
  const png = await readFile(join(process.cwd(), 'public/brand/logo-light.png'))
  return `data:image/png;base64,${png.toString('base64')}`
}

/**
 * The share card drawn by `next/og` (Satori: inline styles only, every multi-child box is flex). Forest
 * room with the cream type of the site's hero (DESIGN.md), topped by the light logo.
 */
export function OgCard({ logo, kicker, title, subtitle }: { logo: string; kicker: string; title: string; subtitle: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#1d3023',
        color: '#f7f5f2',
        padding: '64px 72px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> only */}
      <img src={logo} alt={BRAND_NAME} height={LOGO_HEIGHT} width={Math.round((LOGO_HEIGHT * LOGO_SIZE.width) / LOGO_SIZE.height)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', fontSize: 28, color: '#eae6df', textTransform: 'uppercase', letterSpacing: 2 }}>{kicker}</div>
        <div style={{ display: 'flex', fontSize: title.length > 40 ? 64 : 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: '#eae6df' }}>{subtitle}</div>
      </div>
    </div>
  )
}
