import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, ProgressEvent } from '@shared/types'

// Narrow, named, validated bridge. The renderer never sees raw ipcRenderer.
const api: Api = {
  pickRepo: () => ipcRenderer.invoke('repo:pick'),
  openRepo: (path) => ipcRenderer.invoke('repo:open', path),
  listCommits: (path) => ipcRenderer.invoke('commits:list', path),
  getCapabilities: () => ipcRenderer.invoke('env:capabilities'),
  applyEdits: (path, edits, opts) => ipcRenderer.invoke('rewrite:apply', path, edits, opts),
  restoreBackup: (path, backupRef) => ipcRenderer.invoke('rewrite:restore', path, backupRef),
  onProgress: (cb) => {
    // Forward ONLY the data payload to the renderer callback; never the event.
    const listener = (_event: IpcRendererEvent, data: ProgressEvent): void => cb(data)
    ipcRenderer.on('rewrite:progress', listener)
    return () => {
      ipcRenderer.removeListener('rewrite:progress', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose api on contextBridge:', error)
  }
} else {
  // Fallback (should not happen — contextIsolation is always on).
  // @ts-expect-error augmenting window
  window.api = api
}
