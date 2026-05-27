const KEY = 'recentRepos'

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function saveRecent(path: string): void {
  const list = [path, ...loadRecent().filter((p) => p !== path)].slice(0, 6)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function removeRecent(path: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadRecent().filter((p) => p !== path)))
}
