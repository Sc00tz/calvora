// SPDX-License-Identifier: GPL-3.0-or-later
import { ReactNode } from 'react'

interface Props {
  sidebar: ReactNode
  children: ReactNode
}

export default function Layout({ sidebar, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {sidebar}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
