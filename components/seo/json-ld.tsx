import { serializeJsonLd } from '@/lib/seo'

/** Structured data for crawlers. The payload is escaped by serializeJsonLd (owner-typed text inside). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
