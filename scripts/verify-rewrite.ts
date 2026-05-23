import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listCommits, restoreBackup } from '../src/main/git/service'
import { applyEdits } from '../src/main/git/rewrite'

function run(cwd: string, args: string[], env?: Record<string, string>): string {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
    encoding: 'utf8'
  })
}

let failures = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log('  OK   ', msg)
  } else {
    console.log('  FAIL ', msg)
    failures += 1
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'gcte-test-'))
  try {
    run(dir, ['init', '-b', 'main'])
    run(dir, ['config', 'user.email', 'test@example.com'])
    run(dir, ['config', 'user.name', 'Test User'])
    run(dir, ['config', 'commit.gpgsign', 'false'])

    const dates = [
      '2024-01-01T10:00:00+05:30',
      '2024-01-05T11:00:00+05:30',
      '2024-01-10T12:00:00+05:30',
      '2024-01-15T13:00:00+05:30'
    ]
    dates.forEach((d, i) => {
      writeFileSync(join(dir, `file${i}.txt`), `content ${i}\n`)
      run(dir, ['add', '.'])
      run(dir, ['commit', '-m', `commit ${i}`], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d })
    })

    const before = await listCommits(dir)
    console.log('\nBEFORE (newest-first):')
    before.forEach((c) => console.log('  ', c.shortSha, c.authorDate, c.committerDate, c.subject))

    // before[0] = "commit 3" (HEAD), before[2] = "commit 1" (middle)
    const edits = [
      { sha: before[2].sha, newDate: '2025-03-03T09:15:00+05:30' }, // middle
      { sha: before[0].sha, newDate: '2025-06-06T20:45:00+05:30' } // HEAD
    ]

    console.log('\nApplying edits…')
    const res = await applyEdits(dir, edits, { createBackup: true }, (e) =>
      console.log('  progress:', e.phase, '-', e.message)
    )
    console.log('\nRESULT:', JSON.stringify(res, null, 2))

    const after = await listCommits(dir)
    console.log('\nAFTER (newest-first):')
    after.forEach((c) => console.log('  ', c.shortSha, c.authorDate, c.committerDate, c.subject))

    console.log('\nChecks:')
    assert(res.ok, 'apply succeeded')
    assert(after.length === 4, 'still 4 commits')

    const head = after[0]
    assert(head.authorDate.startsWith('2025-06-06'), 'HEAD author date updated')
    assert(head.committerDate.startsWith('2025-06-06'), 'HEAD committer date updated (both dates set)')

    const mid = after.find((c) => c.subject === 'commit 1')!
    assert(mid.authorDate.startsWith('2025-03-03'), 'middle author date updated')
    assert(mid.committerDate.startsWith('2025-03-03'), 'middle committer date updated (both dates set)')

    assert(head.sha !== before[0].sha, 'HEAD sha changed')
    assert(mid.sha !== before[2].sha, 'middle commit sha changed')

    const oldest = after.find((c) => c.subject === 'commit 0')!
    assert(oldest.sha === before[3].sha, 'oldest commit (before edited range) sha unchanged')

    assert(Boolean(res.backupRef), 'backup branch was created')
    assert(
      res.pushCommand?.includes('--force-with-lease') ?? false,
      'push command uses --force-with-lease'
    )

    // Restore
    console.log('\nRestoring from backup…')
    const r = await restoreBackup(dir, res.backupRef!)
    assert(r.ok, 'restore succeeded')
    const restored = await listCommits(dir)
    assert(restored[0].sha === before[0].sha, 'restore brought back original HEAD sha')
    assert(restored[0].authorDate === before[0].authorDate, 'restore brought back original dates')

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e)
  process.exit(1)
})
