# Git Commit Time Editor

Open a local repository to visualize commits and edit their dates and times from a desktop GUI.

## Features

- Open any local git repository and list commits with author, message, and timestamp.
- GitHub-style activity heatmap with day filtering.
- Inline date and time editing per commit, with clear edited-state highlighting.
- Review dialog that shows all edits and how many commits will be rewritten.
- Optional backup branch before rewrites and a one-click restore action.
- Never pushes automatically; it shows a safe force-push command for you to run.

## Safety notes

This app rewrites history. That changes commit SHAs for the edited commits and every commit after them.
If the branch is shared, coordinate with collaborators and use `--force-with-lease` when pushing.

## Requirements

- Node.js and npm
- Git installed and available on PATH
- Optional: git-filter-repo (detected for future acceleration; current rewrites use rebase)

## Quick start

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Windows packaging

```bash
npm run build:win
```

## Project structure

- src/main: Electron main process, IPC, and git logic.
- src/preload: contextBridge API exposed to the renderer.
- src/renderer: React UI (heatmap, commit table, review dialog).
- src/shared: shared types between main and renderer.

## Restore a rewrite

If you created a backup branch, you can restore from the UI or with git:

```bash
git reset --hard <backupRef>
```

## License

MIT
