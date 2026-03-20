// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react'
import { getMe } from './api/client'
import LoginForm from './components/LoginForm'
import CalendarApp from './components/CalendarApp'
import type { User } from './types/calendar'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  if (!authChecked) return <Spinner />

  if (!user) return <LoginForm onLogin={setUser} />

  // Key on username so the whole tree remounts fresh on login/logout,
  // ensuring useCalendars fires with a valid session.
  return <CalendarApp key={user.username} user={user} onLogout={() => setUser(null)} />
}

function Spinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
