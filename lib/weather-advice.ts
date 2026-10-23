/** Pure: what the current weather means for an outdoor court (no network; tested against fixtures). */

export interface WeatherNow {
  temperature: number
  precipitation: number
  windKmh: number
  /** WMO weather code. */
  code: number
}

export interface WeatherAdvice {
  tone: 'good' | 'warn'
  text: string
}

export function weatherAdvice(w: WeatherNow): WeatherAdvice {
  const t = Math.round(w.temperature)
  // WMO: 51-67 drizzle/rain, 71-77 snow, 80-82 showers, 95-99 thunderstorm.
  if (w.code >= 95) return { tone: 'warn', text: 'Orages · privilégiez un terrain couvert' }
  if (w.precipitation > 0.2 || (w.code >= 51 && w.code <= 82)) return { tone: 'warn', text: `Pluie · ${t} °C · privilégiez un terrain couvert` }
  if (w.windKmh >= 35) return { tone: 'warn', text: `Vent fort · ${Math.round(w.windKmh)} km/h en extérieur` }
  if (t >= 34) return { tone: 'warn', text: `Forte chaleur · ${t} °C · préférez le soir` }
  if (t <= 8) return { tone: 'warn', text: `Frais · ${t} °C en extérieur` }
  return { tone: 'good', text: `${t} °C · météo idéale pour jouer en extérieur` }
}
