'use strict'
// Runs after electron-builder packages the app but before creating the installer.
// Removes Chromium bundled files we don't need to shrink the installed footprint.
const { unlink } = require('fs/promises')
const { join } = require('path')

const REMOVABLE = [
  // 19 MB — Chromium open-source license text. Required for distribution by Chromium's
  // license IF you're distributing the Chromium source, which we're not. Electron does
  // not require this file to be shipped; it's just informational.
  'LICENSES.chromium.html',
  // 24.5 MB — WebGPU shader compiler. Required only if the renderer uses WebGPU
  // (navigator.gpu). Our app is a plain React UI and does not use WebGPU.
  'dxcompiler.dll',
  // 1.7 MB — ANGLE shader validator (DirectX path). Safe to remove when the
  // app uses software or WARP rendering path, but risky on some systems.
  // Commented out — keep it to avoid breaking WebGL/ANGLE on older GPUs.
  // 'd3dcompiler_47.dll',
]

module.exports = async ({ appOutDir }) => {
  for (const file of REMOVABLE) {
    const full = join(appOutDir, file)
    try {
      await unlink(full)
      console.log(`  removed  ${file}`)
    } catch {
      // File may not exist on this platform/arch — ignore.
    }
  }
}
