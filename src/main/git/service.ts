import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Commit, Capabilities, OpenRepoResult, RepoInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

const UNIT = '\x1f' // field separator inside a log line

export function git(repoPath: string, extra: Partial<SimpleGitOptions> = {}): SimpleGit {
  return simpleGit({
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 1,
    trimmed: false,
    ...extra
  })
}

export async function openRepo(repoPath: string): Promise<OpenRepoResult> {
  try {
    const g = git(repoPath)
    const isRepo = await g.checkIsRepo()
    if (!isRepo) {
      return { ok: false, error: 'That folder is not a git repository.' }
    }

    const branchRaw = (await g.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    const isDetached = branchRaw === 'HEAD'

    let commitCount = 0
    let headSha = ''
    try {
      headSha = (await g.raw(['rev-parse', 'HEAD'])).trim()
      commitCount = parseInt((await g.raw(['rev-list', '--count', 'HEAD'])).trim(), 10) || 0
    } catch {
      // Empty repository (no commits yet).
      commitCount = 0
      headSha = ''
    }

    const status = await g.status()

    const repo: RepoInfo = {
      path: repoPath,
      branch: isDetached ? '(detached HEAD)' : branchRaw,
      commitCount,
      headSha,
      isDirty: !status.isClean(),
      isDetached
    }
    return { ok: true, repo }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }
}

export async function listCommits(repoPath: string): Promise<Commit[]> {
  const g = git(repoPath)
  const format = ['%H', '%aI', '%cI', '%an', '%ae', '%s'].join(UNIT)
  let raw: string
  try {
    raw = await g.raw(['log', `--pretty=format:${format}`, '--no-color'])
  } catch {
    // No commits yet, or bad ref.
    return []
  }
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, authorDate, committerDate, authorName, authorEmail, subject] = line.split(UNIT)
      return {
        sha,
        shortSha: sha.slice(0, 7),
        authorDate,
        committerDate,
        authorName,
        authorEmail,
        subject: subject ?? ''
      } satisfies Commit
    })
}

export async function getCapabilities(): Promise<Capabilities> {
  let hasGit = false
  let gitVersion: string | undefined
  try {
    const { stdout } = await execFileAsync('git', ['--version'])
    hasGit = true
    gitVersion = stdout.trim().replace(/^git version\s*/i, '')
  } catch {
    hasGit = false
  }

  let hasFilterRepo = false
  try {
    await execFileAsync('git', ['filter-repo', '--version'])
    hasFilterRepo = true
  } catch {
    hasFilterRepo = false
  }

  return { hasGit, gitVersion, hasFilterRepo }
}

/** Restore the current branch to a previously-created backup ref. */
export async function restoreBackup(
  repoPath: string,
  backupRef: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const g = git(repoPath)
    // Verify the ref exists before touching the working tree.
    await g.raw(['rev-parse', '--verify', backupRef])
    await g.raw(['reset', '--hard', backupRef])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
