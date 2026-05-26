import { existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { isAbsolute, join } from 'path'
import type { ApplyResult, CommitEdit, ProgressEvent } from '@shared/types'
import { git, errMessage } from './service'

/**
 * Sequence-editor script written to a temp file and pointed at by
 * GIT_SEQUENCE_EDITOR. It rewrites the interactive-rebase todo so that every
 * commit whose (abbreviated) hash is a prefix of one of GCTE_TARGETS is marked
 * `edit` instead of `pick`, causing the rebase to stop at each one.
 */
const SEQ_EDITOR_SOURCE = `
const fs = require('fs')
const todoPath = process.argv[2]
const targets = (process.env.GCTE_TARGETS || '').split(',').filter(Boolean)
const lines = fs.readFileSync(todoPath, 'utf8').split('\\n')
const out = lines.map((line) => {
  const m = line.match(/^(pick|p)\\s+([0-9a-fA-F]+)\\s/)
  if (!m) return line
  const sha = m[2]
  if (targets.some((t) => t.startsWith(sha))) return line.replace(/^(pick|p)\\b/, 'edit')
  return line
})
fs.writeFileSync(todoPath, out.join('\\n'))
`

function writeSeqEditor(): string {
  const scriptPath = join(tmpdir(), 'gcte-seq-editor.cjs')
  writeFileSync(scriptPath, SEQ_EDITOR_SOURCE, 'utf8')
  return scriptPath
}

/**
 * A git instance that is permitted to use our own GIT_SEQUENCE_EDITOR/GIT_EDITOR.
 * simple-git blocks custom editors by default (arg-injection defense); here the
 * editor is a script we wrote ourselves, so opting in is safe and intentional.
 */
function gitE(repoPath: string) {
  return git(repoPath, { unsafe: { allowUnsafeEditor: true } })
}

async function isRebaseInProgress(repoPath: string): Promise<boolean> {
  const gitDir = (await git(repoPath).raw(['rev-parse', '--git-dir'])).trim()
  const abs = isAbsolute(gitDir) ? gitDir : join(repoPath, gitDir)
  return existsSync(join(abs, 'rebase-merge')) || existsSync(join(abs, 'rebase-apply'))
}

/**
 * Amend the commit currently at HEAD, setting BOTH author and committer date.
 * `--date` sets the AUTHOR date (what GitHub's graph counts); `--amend` ignores
 * GIT_AUTHOR_DATE, so the flag is required. GIT_COMMITTER_DATE sets the committer.
 */
async function amendDate(
  repoPath: string,
  baseEnv: NodeJS.ProcessEnv,
  iso: string
): Promise<void> {
  await gitE(repoPath)
    .env({ ...baseEnv, GIT_COMMITTER_DATE: iso })
    .raw(['commit', '--amend', '--no-edit', `--date=${iso}`])
}

async function currentBranch(repoPath: string): Promise<string> {
  return (await git(repoPath).raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
}

async function pushCommandFor(repoPath: string, branch: string): Promise<string> {
  let remote = 'origin'
  try {
    const remotes = (await git(repoPath).raw(['remote'])).trim().split('\n').filter(Boolean)
    if (remotes.length > 0 && !remotes.includes('origin')) remote = remotes[0]
  } catch {
    /* no remotes — still show the canonical command */
  }
  return `git push --force-with-lease ${remote} ${branch}`
}

export async function applyEdits(
  repoPath: string,
  edits: CommitEdit[],
  opts: { createBackup: boolean },
  onProgress: (e: ProgressEvent) => void
): Promise<ApplyResult> {
  const total = edits.length
  if (total === 0) return { ok: false, error: 'No edits to apply.' }

  const g = git(repoPath)
  const editMap = new Map(edits.map((e) => [e.sha, e.newDate]))

  // ---- Preflight -----------------------------------------------------------
  onProgress({ phase: 'preflight', current: 0, total, message: 'Checking repository…' })
  try {
    if (!(await g.checkIsRepo())) return { ok: false, error: 'That folder is not a git repository.' }
    const status = await g.status()
    if (!status.isClean()) {
      return {
        ok: false,
        error: 'Working tree has uncommitted changes. Commit or stash them before rewriting.'
      }
    }
    const branch = await currentBranch(repoPath)
    if (branch === 'HEAD') {
      return { ok: false, error: 'HEAD is detached. Check out a branch before rewriting.' }
    }
    if (await isRebaseInProgress(repoPath)) {
      return { ok: false, error: 'A rebase is already in progress in this repository.' }
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  // Order targets oldest-first to match the rebase todo's stop order.
  let allShas: string[]
  try {
    allShas = (await g.raw(['rev-list', 'HEAD'])).trim().split('\n').filter(Boolean)
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }
  const headSha = allShas[0]
  const ordered = allShas.filter((s) => editMap.has(s)).reverse() // oldest-first
  if (ordered.length === 0) {
    return { ok: false, error: 'None of the edited commits are on the current branch.' }
  }

  // ---- Backup --------------------------------------------------------------
  let backupRef: string | undefined
  if (opts.createBackup) {
    onProgress({ phase: 'backup', current: 0, total, message: 'Creating backup branch…' })
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      backupRef = `backup/pre-rewrite-${ts}`
      await g.raw(['branch', backupRef, 'HEAD'])
    } catch (err) {
      return { ok: false, error: `Could not create backup branch: ${errMessage(err)}` }
    }
  }

  const branch = await currentBranch(repoPath)

  // ---- Fast path: only HEAD is edited -> a single amend --------------------
  if (ordered.length === 1 && ordered[0] === headSha) {
    onProgress({ phase: 'rewrite', current: 1, total, message: 'Re-timing the latest commit…' })
    try {
      await amendDate(repoPath, { ...process.env }, editMap.get(headSha)!)
      const newHead = (await g.raw(['rev-parse', 'HEAD'])).trim()
      onProgress({ phase: 'done', current: total, total, message: 'Done.' })
      return {
        ok: true,
        backupRef,
        rewrittenShas: [newHead],
        pushCommand: await pushCommandFor(repoPath, branch)
      }
    } catch (err) {
      return { ok: false, error: errMessage(err), backupRef }
    }
  }

  // ---- Full-history path: orchestrated interactive rebase ------------------
  const oldestSha = ordered[0]
  let baseArg: string
  try {
    await g.raw(['rev-parse', '--verify', `${oldestSha}^`])
    baseArg = `${oldestSha}^`
  } catch {
    baseArg = '--root' // oldest edited commit is the root commit
  }

  const seqScript = writeSeqEditor()
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_SEQUENCE_EDITOR: `node "${seqScript.replace(/\\/g, '/')}"`,
    GIT_EDITOR: 'true',
    GCTE_TARGETS: ordered.join(',')
  }

  try {
    // Start the rebase. With our sequence editor marking targets `edit`, this
    // stops at the oldest edited commit.
    const rebaseArgs = baseArg === '--root' ? ['rebase', '-i', '--root'] : ['rebase', '-i', baseArg]
    await gitE(repoPath).env(baseEnv).raw(rebaseArgs)

    let i = 0
    while (await isRebaseInProgress(repoPath)) {
      if (i >= ordered.length) {
        throw new Error('Rebase stopped more times than expected; aborting to stay safe.')
      }
      const iso = editMap.get(ordered[i])!
      onProgress({
        phase: 'rewrite',
        current: i + 1,
        total: ordered.length,
        message: `Re-timing commit ${i + 1} of ${ordered.length}…`
      })
      await amendDate(repoPath, baseEnv, iso)
      i += 1
      await gitE(repoPath).env(baseEnv).raw(['rebase', '--continue'])
    }

    if (i < ordered.length) {
      throw new Error('Rebase finished before all edits were applied.')
    }

    const range = baseArg === '--root' ? ['rev-list', 'HEAD'] : ['rev-list', `${baseArg}..HEAD`]
    const rewrittenShas = (await g.raw(range)).trim().split('\n').filter(Boolean)

    onProgress({ phase: 'done', current: ordered.length, total: ordered.length, message: 'Done.' })
    return {
      ok: true,
      backupRef,
      rewrittenShas,
      pushCommand: await pushCommandFor(repoPath, branch)
    }
  } catch (err) {
    // Leave the repo clean: abort the rebase if it's still running.
    try {
      if (await isRebaseInProgress(repoPath)) {
        await git(repoPath).raw(['rebase', '--abort'])
      }
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      error: `Rewrite failed and was rolled back: ${errMessage(err)}`,
      backupRef
    }
  }
}
