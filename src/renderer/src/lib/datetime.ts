import { format, parseISO, eachDayOfInterval, subYears, isBefore } from 'date-fns'
import type { HeatmapDay } from '@shared/types'

/**
 * Format an instant as ISO 8601 with the machine's local UTC offset, e.g.
 * "2026-06-01T21:30:00+05:30". This is what we write to git so the commit
 * lands on the intended local day. git accepts strict ISO 8601.
 */
export function toLocalIso(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm:ssxxx")
}

export function parseIso(iso: string): Date {
  return parseISO(iso)
}

/** Human-friendly local display, e.g. "01 Jun 2026 · 9:30 PM". */
export function displayDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMM yyyy · h:mm a')
  } catch {
    return iso
  }
}

/** Local calendar day key (YYYY-MM-DD) of the instant. */
export function localDayKey(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd')
  } catch {
    return iso.slice(0, 10)
  }
}

/** "HH:mm:ss" for an <input type="time" step="1"> value. */
export function timeInputValue(date: Date): string {
  return format(date, 'HH:mm:ss')
}

/** Combine a calendar day with an "HH:mm[:ss]" time string into one Date. */
export function combineDayAndTime(day: Date, time: string): Date {
  const [h = '0', m = '0', s = '0'] = time.split(':')
  const out = new Date(day)
  out.setHours(Number(h), Number(m), Number(s), 0)
  return out
}

function levelForCount(count: number): HeatmapDay['level'] {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

/**
 * Build a continuous daily series for the contribution heatmap from a set of
 * effective author-date ISO strings (original or pending-edited). Every day in
 * the window is present so react-activity-calendar renders a clean grid; the
 * window is at least one year wide for a familiar look.
 */
export function buildHeatmap(effectiveDates: string[]): HeatmapDay[] {
  const counts = new Map<string, number>()
  for (const iso of effectiveDates) {
    const key = localDayKey(iso)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  const keys = [...counts.keys()].sort()
  let start = parseISO(`${keys[0]}T00:00:00`)
  const end = parseISO(`${keys[keys.length - 1]}T00:00:00`)
  const minStart = subYears(end, 1)
  if (isBefore(minStart, start)) start = minStart // widen to >= 1 year

  return eachDayOfInterval({ start, end }).map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    const count = counts.get(key) ?? 0
    return { date: key, count, level: levelForCount(count) }
  })
}
