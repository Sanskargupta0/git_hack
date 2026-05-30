import { useState } from 'react'
import type { RepoInfo } from '@shared/types'
import { RepoPicker } from '@/components/RepoPicker'
import { Workspace } from '@/components/Workspace'

export default function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null)

  if (!repo) return <RepoPicker onOpened={setRepo} />
  return <Workspace key={repo.path} repo={repo} onClose={() => setRepo(null)} />
}
