import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FolderGit2,
  GitBranch,
  ListRestart,
  Loader2,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import type { Commit, RepoInfo } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ModeToggle } from '@/components/mode-toggle'
import { ContributionHeatmap } from '@/components/ContributionHeatmap'
import { CommitTable } from '@/components/CommitTable'
import { ReviewDialog } from '@/components/ReviewDialog'
import { buildHeatmap, localDayKey } from '@/lib/datetime'

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

export function Workspace({ repo, onClose }: { repo: RepoInfo; onClose: () => void }) {
  const [repoInfo, setRepoInfo] = useState<RepoInfo>(repo)
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)

  const reload = useCallback(async () => {
    setCommits(null)
    setLoadError(null)
    setEdits({})
    setSelectedDay(null)
    try {
      const list = await window.api.listCommits(repo.path)
      setCommits(list)
      const info = await window.api.openRepo(repo.path)
      if (info.ok && info.repo) setRepoInfo(info.repo)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      setCommits([])
    }
  }, [repo.path])

  useEffect(() => {
    void reload()
  }, [reload])

  const originalMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of commits ?? []) m[c.sha] = c.authorDate
    return m
  }, [commits])

  const onEdit = useCallback(
    (sha: string, iso: string) => {
      setEdits((prev) => {
        const next = { ...prev }
        if (iso === originalMap[sha]) delete next[sha]
        else next[sha] = iso
        return next
      })
    },
    [originalMap]
  )

  const onRevert = useCallback((sha: string) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[sha]
      return next
    })
  }, [])

  const enriched = useMemo(
    () =>
      (commits ?? []).map((c) => ({
        ...c,
        effectiveDate: edits[c.sha] ?? c.authorDate,
        isEdited: c.sha in edits
      })),
    [commits, edits]
  )

  const heatmap = useMemo(() => buildHeatmap(enriched.map((c) => c.effectiveDate)), [enriched])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return enriched.filter((c) => {
      if (selectedDay && localDayKey(c.effectiveDate) !== selectedDay) return false
      if (q && !`${c.subject} ${c.authorName} ${c.shortSha}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [enriched, selectedDay, filter])

  const editCount = Object.keys(edits).length

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <FolderGit2 className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold" title={repoInfo.path}>
              {basename(repoInfo.path)}
            </span>
            <Badge variant="secondary" className="gap-1">
              <GitBranch className="h-3 w-3" />
              {repoInfo.branch}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{repoInfo.commitCount} commits</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void reload()}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Open another…
          </Button>
          <ModeToggle />
          <Button disabled={editCount === 0} onClick={() => setReviewOpen(true)}>
            Review changes{editCount > 0 ? ` (${editCount})` : ''}
          </Button>
        </div>
      </header>

      {(repoInfo.isDirty || repoInfo.isDetached) && (
        <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {repoInfo.isDetached
            ? 'HEAD is detached — check out a branch before rewriting commit dates.'
            : 'Working tree has uncommitted changes — commit or stash them before applying edits.'}
        </div>
      )}

      {commits === null ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading commits…
        </div>
      ) : loadError ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-destructive">
          {loadError}
        </div>
      ) : commits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          This repository has no commits yet.
        </div>
      ) : (
        <>
          <div className="border-b p-4">
            <ContributionHeatmap
              data={heatmap}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          </div>

          <div className="flex items-center gap-3 px-4 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter commits…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 w-64 pl-7"
              />
            </div>
            {selectedDay && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {selectedDay}
                <button
                  className="rounded-sm p-0.5 hover:bg-background/50"
                  onClick={() => setSelectedDay(null)}
                  title="Clear day filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{visible.length} shown</span>
            {editCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                onClick={() => setEdits({})}
              >
                <ListRestart className="h-3.5 w-3.5" />
                Reset all edits
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <CommitTable rows={visible} onEdit={onEdit} onRevert={onRevert} />
          </div>
        </>
      )}

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        repoPath={repoInfo.path}
        commits={commits ?? []}
        edits={edits}
        onApplied={() => void reload()}
      />
    </div>
  )
}
