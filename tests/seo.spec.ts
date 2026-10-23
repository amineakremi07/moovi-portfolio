import { test, expect } from '@playwright/test'

import { BRAND_NAME } from '../lib/brand'
import { buildClubs } from '../lib/clubs'
import { DEFAULT_WEEKLY_HOURS } from '../lib/operating-hours'
import { clubDirectoryJsonLd, clubJsonLd, openingHours, platformJsonLd, serializeJsonLd, sportList } from '../lib/seo'

const APP = 'https://moovi.example'
const [club] = buildClubs(
  [{ id: 'c1', name: 'Padel Arena', address: '1 Rue de Carthage', city: 'Tunis', latitude: 36.8, longitude: 10.18, weekly_hours: null }],
  [
    { id: 'k1', org_id: 'c1', sport: 'padel', price_per_hour: 60, open_time: '08:00:00', close_time: '00:00:00' },
    { id: 'k2', org_id: 'c1', sport: 'tennis', price_per_hour: 30, open_time: '09:00:00', close_time: '22:00:00' },
  ]
)

test.describe('structured data', () => {
  test('a club is a SportsClub with address, pin, sports, prices and a ReserveAction on the platform', () => {
    const ld = clubJsonLd({ club, description: null, photos: [], whatsapp: '+21620000000' }, APP)
    expect(ld['@type']).toEqual(['SportsClub', 'SportsActivityLocation'])
    expect(ld.url).toBe(`${APP}/courts/c1`)
    expect(ld.address).toMatchObject({ addressLocality: 'Tunis', addressCountry: 'TN' })
    expect(ld.geo).toMatchObject({ latitude: 36.8, longitude: 10.18 })
    expect(ld.keywords).toBe('Padel, Tennis')
    expect(ld.priceRange).toMatch(/TND$/)
    const action = ld.potentialAction as Record<string, unknown>
    expect(action['@type']).toBe('ReserveAction')
    expect((action.target as Record<string, unknown>).urlTemplate).toBe(`${APP}/courts/c1`)
    expect((action.provider as Record<string, unknown>).name).toBe(BRAND_NAME)
    expect(ld).not.toHaveProperty('image') // no photos: no empty array
  })

  test('opening hours: weekly hours per day (midnight as 23:59), else the courts window every day', () => {
    const weekly = { ...DEFAULT_WEEKLY_HOURS, sun: { open: false, from: '08:00', to: '00:00' } }
    const days = openingHours({ ...club, weeklyHours: weekly })
    expect(days).toHaveLength(6)
    expect(days[0]).toMatchObject({ dayOfWeek: 'https://schema.org/Monday', opens: '08:00', closes: '23:59' })
    const fallback = openingHours(club)
    expect(fallback).toHaveLength(1)
    expect(fallback[0]).toMatchObject({ opens: '08:00', closes: '23:59' })
    expect((fallback[0].dayOfWeek as string[]).length).toBe(7)
  })

  test('platform graph and directory use absolute urls', () => {
    const graph = platformJsonLd(APP)['@graph'] as Record<string, unknown>[]
    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'WebSite'])
    const list = clubDirectoryJsonLd([club], APP)
    expect(list.numberOfItems).toBe(1)
    expect((list.itemListElement as Record<string, unknown>[])[0].url).toBe(`${APP}/courts/c1`)
  })

  test('owner-typed text cannot close the script tag', () => {
    const hostile = { ...club, name: '</script><script>alert(1)</script>' }
    const out = serializeJsonLd(clubJsonLd({ club: hostile, description: `a & b ${String.fromCharCode(0x2028)}`, photos: [], whatsapp: null }, APP))
    expect(out).not.toMatch(/[<>&]/)
    expect(out).not.toContain(String.fromCharCode(0x2028))
    expect(JSON.parse(out).name).toBe(hostile.name) // still the same data once parsed
  })

  test('sport list reads naturally in French', () => {
    expect(sportList([{ sport: 'padel' }])).toBe('Padel')
    expect(sportList([{ sport: 'padel' }, { sport: 'tennis' }, { sport: 'football' }])).toBe('Padel, Tennis et Football')
  })
})
