import { useEffect, useState } from 'react'
import { AlertTriangle, FolderGit2, FolderOpen, GitBranch, Info, Loader2, X } from 'lucide-react'
import type { Capabilities, RepoInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ModeToggle } from '@/components/mode-toggle'
import { loadRecent, removeRecent, saveRecent } from '@/lib/recent'

export function RepoPicker({ onOpened }: { onOpened: (repo: RepoInfo) => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>(() => loadRecent())

  useEffect(() => {
    window.api.getCapabilities().then(setCaps).catch(() => setCaps(null))
  }, [])

  async function openPath(path: string) {
    setOpening(true)
    setError(null)
    try {
      const res = await window.api.openRepo(path)
      if (!res.ok || !res.repo) {
        setError(res.error ?? 'Could not open that folder as a git repository.')
        removeRecent(path)
        setRecent(loadRecent())
        return
      }
      saveRecent(path)
      onOpened(res.repo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOpening(false)
    }
  }

  async function pick() {
    const path = await window.api.pickRepo()
    if (path) await openPath(path)
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <FolderGit2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Git Commit Time Editor</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Open a local repository to visualize its commits and edit their dates &amp; times.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <Button size="lg" className="h-12 text-base" disabled={opening} onClick={pick}>
          {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
          Open Repository…
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {recent.length > 0 && (
          <Card className="p-2">
            <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent
            </p>
            <ul className="flex flex-col">
              {recent.map((path) => (
                <li key={path} className="group flex items-center">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => openPath(path)}
                    disabled={opening}
                  >
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate" title={path}>
                      {path}
                    </span>
                  </button>
                  <button
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    title="Remove from recent"
                    onClick={() => {
                      removeRecent(path)
                      setRecent(loadRecent())
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {caps && !caps.hasGit && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Git was not found on your system. Install Git and restart the app — it&apos;s required
              to read and rewrite commit history.
            </span>
          </div>
        )}

        {caps?.hasGit && !caps.hasFilterRepo && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">git-filter-repo</span> isn&apos;t
              installed. That&apos;s fine — full-history edits use a built-in rebase method. (Install
              it later for faster rewrites on very large repos.)
            </span>
          </div>
        )}

        {caps?.hasGit && (
          <p className="text-center text-xs text-muted-foreground">
            Detected git {caps.gitVersion}
          </p>
        )}
      </div>
    </div>
  )
}
