// Shared contract between the Electron main process, the preload bridge,
// and the React renderer. Keep this the single source of truth.

export interface Commit {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  /** ISO 8601 with explicit offset, e.g. 2026-06-01T21:30:00+05:30 */
  authorDate: string
  /** ISO 8601 with explicit offset */
  committerDate: string
  subject: string
}

export interface RepoInfo {
  path: string
  branch: string
  commitCount: number
  headSha: string
  /** working tree has uncommitted changes */
  isDirty: boolean
  /** HEAD is detached (not on a branch) */
  isDetached: boolean
}

export interface HeatmapDay {
  /** YYYY-MM-DD in the commit's local day */
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface Capabilities {
  hasGit: boolean
  gitVersion?: string
  /** git-filter-repo present on PATH (optional accelerator) */
  hasFilterRepo: boolean
}

export interface CommitEdit {
  sha: string
  /** ISO 8601 with offset. Applied to BOTH author and committer date. */
  newDate: string
}

export type ProgressPhase = 'preflight' | 'backup' | 'rewrite' | 'done' | 'error'

export interface ProgressEvent {
  phase: ProgressPhase
  current: number
  total: number
  message: string
}

export interface ApplyResult {
  ok: boolean
  backupRef?: string
  rewrittenShas?: string[]
  /** The exact command the user should run to publish (we never push for them). */
  pushCommand?: string
  error?: string
}

export interface OpenRepoResult {
  ok: boolean
  repo?: RepoInfo
  error?: string
}

/** The API surface exposed on `window.api` via contextBridge. */
export interface Api {
  pickRepo(): Promise<string | null>
  openRepo(path: string): Promise<OpenRepoResult>
  listCommits(path: string): Promise<Commit[]>
  getCapabilities(): Promise<Capabilities>
  applyEdits(
    path: string,
    edits: CommitEdit[],
    opts: { createBackup: boolean }
  ): Promise<ApplyResult>
  restoreBackup(path: string, backupRef: string): Promise<{ ok: boolean; error?: string }>
  /** Subscribe to rewrite progress. Returns an unsubscribe function. */
  onProgress(cb: (e: ProgressEvent) => void): () => void
}
