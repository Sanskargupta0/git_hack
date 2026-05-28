import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Undo2,
  XCircle
} from 'lucide-react'
import type { ApplyResult, Commit, ProgressEvent } from '@shared/types'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { displayDateTime } from '@/lib/datetime'

type Phase = 'idle' | 'running' | 'done' | 'error'

export function ReviewDialog({
  open,
  onOpenChange,
  repoPath,
  commits,
  edits,
  onApplied
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
  commits: Commit[]
  edits: Record<string, string>
  onApplied: () => void
}) {
  const [createBackup, setCreateBackup] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onProgress(setProgress)
    return unsubscribe
  }, [])

  // Reset transient state whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setPhase('idle')
      setProgress(null)
      setResult(null)
    }
  }, [open])

  const { editedList, affectedCount } = useMemo(() => {
    const list = commits
      .map((c, index) => ({ commit: c, index, newIso: edits[c.sha] }))
      .filter((e): e is { commit: Commit; index: number; newIso: string } => Boolean(e.newIso))
    const maxIndex = list.reduce((m, e) => Math.max(m, e.index), -1)
    return { editedList: list, affectedCount: maxIndex + 1 }
  }, [commits, edits])

  async function apply() {
    setPhase('running')
    setProgress(null)
    setResult(null)
    const editsArr = editedList.map((e) => ({ sha: e.commit.sha, newDate: e.newIso }))
    try {
      const res = await window.api.applyEdits(repoPath, editsArr, { createBackup })
      setResult(res)
      setPhase(res.ok ? 'done' : 'error')
      if (res.ok) {
        toast.success('History rewritten locally.')
        onApplied()
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
      setPhase('error')
    }
  }

  async function copyPush() {
    if (!result?.pushCommand) return
    await navigator.clipboard.writeText(result.pushCommand)
    toast.success('Push command copied to clipboard.')
  }

  async function restore() {
    if (!result?.backupRef) return
    const r = await window.api.restoreBackup(repoPath, result.backupRef)
    if (r.ok) {
      toast.success('Restored from backup.')
      onApplied()
      onOpenChange(false)
    } else {
      toast.error(r.error ?? 'Restore failed.')
    }
  }

  const running = phase === 'running'

  return (
    <Dialog open={open} onOpenChange={(o) => (running ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review &amp; apply changes</DialogTitle>
          <DialogDescription>
            {phase === 'done'
              ? 'Your local history has been rewritten.'
              : `${editedList.length} commit${editedList.length === 1 ? '' : 's'} edited.`}
          </DialogDescription>
        </DialogHeader>

        {(phase === 'idle' || phase === 'running') && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="space-y-1 text-foreground/90">
                <p>
                  Rewriting changes commit IDs.{' '}
                  <span className="font-semibold">
                    {affectedCount} commit{affectedCount === 1 ? '' : 's'} will get new IDs
                  </span>{' '}
                  (the ones you edited, plus every commit after them).
                </p>
                <p className="text-xs text-muted-foreground">
                  Nothing is pushed automatically. To update a remote you&apos;ll force-push
                  yourself, which affects collaborators on that branch.
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-md border p-3">
              <span className="text-sm">
                Create a backup branch first
                <span className="block text-xs text-muted-foreground">
                  Lets you undo the rewrite with one click.
                </span>
              </span>
              <Switch checked={createBackup} disabled={running} onCheckedChange={setCreateBackup} />
            </label>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Edited commits
              </div>
              <ScrollArea className="max-h-[240px]">
                <ul className="divide-y">
                  {editedList.map((e) => (
                    <li key={e.commit.sha} className="flex flex-col gap-1 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.commit.shortSha}
                        </span>
                        <span className="truncate" title={e.commit.subject}>
                          {e.commit.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground line-through">
                          {displayDateTime(e.commit.authorDate)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {displayDateTime(e.newIso)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>

            {running && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {progress?.message ?? 'Working…'}
                  {progress && progress.total > 0 ? ` (${progress.current}/${progress.total})` : ''}
                </span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" disabled={running} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={running || editedList.length === 0} onClick={apply}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Apply {editedList.length} change{editedList.length === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>
                Rewrote {result.rewrittenShas?.length ?? 0} commit
                {(result.rewrittenShas?.length ?? 0) === 1 ? '' : 's'} in your local repository.
              </span>
            </div>

            {result.backupRef && (
              <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span className="min-w-0">
                  Backup saved at{' '}
                  <Badge variant="secondary" className="font-mono">
                    {result.backupRef}
                  </Badge>
                </span>
                <Button variant="outline" size="sm" onClick={restore}>
                  <Undo2 className="h-3.5 w-3.5" />
                  Restore
                </Button>
              </div>
            )}

            {result.pushCommand && (
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  We didn&apos;t push anything. When you&apos;re ready, run:
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                  <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-1 font-mono text-xs">
                    {result.pushCommand}
                  </code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyPush}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{result?.error ?? 'The rewrite failed.'}</span>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setPhase('idle')}>Try again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
