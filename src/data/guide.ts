// Guidebook track notes researched from PWS walk notes and trip reports (see guide.json `sources`).
import guide from './guide.json'

const legs = guide.legs as Record<string, string>
const stops = guide.stops as Record<string, string>
export const GUIDE_SOURCES = guide.sources as string[]

/** Repeat stops on the walk-out carry an `-r` suffix; they share the outbound notes. */
const base = (id: string) => id.replace(/-r$/, '')

export const legGuide = (key: string): string | undefined => legs[key]
export const stopGuide = (id: string): string | undefined => stops[id] ?? stops[base(id)]
