import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { CommitEdit, ProgressEvent } from '@shared/types'
import { openRepo, listCommits, getCapabilities, restoreBackup } from './git/service'
import { applyEdits } from './git/rewrite'

/**
 * Defense in depth: only accept IPC from our own renderer (a local file in
 * production, or the Vite dev server in development).
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  return (
    url.startsWith('file://') ||
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.0.0.1')
  )
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid argument: ${name} must be a non-empty string`)
  }
  return value
}

function assertEdits(value: unknown): CommitEdit[] {
  if (!Array.isArray(value)) throw new Error('Invalid argument: edits must be an array')
  return value.map((e, i) => {
    if (!e || typeof e !== 'object') throw new Error(`Invalid edit at index ${i}`)
    const sha = assertString((e as CommitEdit).sha, `edits[${i}].sha`)
    const newDate = assertString((e as CommitEdit).newDate, `edits[${i}].newDate`)
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error(`edits[${i}].sha is not a valid hash`)
    return { sha, newDate }
  })
}

/** Wrap a handler so untrusted senders are rejected uniformly. */
function handle<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error('Rejected IPC from untrusted sender')
    }
    return fn(event, ...args)
  })
}

export function registerIpc(): void {
  handle('repo:pick', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Select a git repository',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  handle('repo:open', (_e, path) => openRepo(assertString(path, 'path')))

  handle('commits:list', (_e, path) => listCommits(assertString(path, 'path')))

  handle('env:capabilities', () => getCapabilities())

  handle('rewrite:apply', (event, path, edits, opts) => {
    const repoPath = assertString(path, 'path')
    const parsed = assertEdits(edits)
    const createBackup = Boolean((opts as { createBackup?: boolean })?.createBackup)
    const onProgress = (e: ProgressEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send('rewrite:progress', e)
    }
    return applyEdits(repoPath, parsed, { createBackup }, onProgress)
  })

  handle('rewrite:restore', (_e, path, backupRef) =>
    restoreBackup(assertString(path, 'path'), assertString(backupRef, 'backupRef'))
  )
}
