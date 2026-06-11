// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef, useMemo } from 'react'
import { getAllContacts } from '../api/client'
import type { Attendee, Contact } from '../types/calendar'

interface Props {
  value: Attendee[]
  onChange: (attendees: Attendee[]) => void
}

// Loose email check — just enough to reject obvious non-emails before adding a guest.
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

const STATUS_LABEL: Record<NonNullable<Attendee['status']>, string> = {
  'NEEDS-ACTION': 'No response',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  TENTATIVE: 'Maybe',
}

const STATUS_DOT: Record<NonNullable<Attendee['status']>, string> = {
  'NEEDS-ACTION': 'bg-gray-300',
  ACCEPTED: 'bg-green-500',
  DECLINED: 'bg-red-500',
  TENTATIVE: 'bg-amber-400',
}

// Flatten a contact's emails into one suggestion per address.
interface Suggestion { name: string; email: string }

export default function AttendeesField({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lazily load contacts once for autocomplete; failure is non-fatal (free-text still works).
  useEffect(() => {
    let cancelled = false
    getAllContacts()
      .then((cs) => { if (!cancelled) setContacts(cs) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const suggestions = useMemo<Suggestion[]>(() => {
    const all: Suggestion[] = []
    for (const c of contacts) {
      for (const e of c.email ?? []) {
        if (e.value) all.push({ name: c.fullName, email: e.value })
      }
    }
    return all
  }, [contacts])

  const q = query.trim().toLowerCase()
  const existing = new Set(value.map((a) => a.email.toLowerCase()))
  const matches = q
    ? suggestions
        .filter((s) => !existing.has(s.email.toLowerCase()) &&
          (s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)))
        .slice(0, 6)
    : []

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function addAttendee(email: string, name?: string) {
    const clean = email.trim()
    if (!isEmail(clean)) return
    if (existing.has(clean.toLowerCase())) { setQuery(''); return }
    onChange([...value, { email: clean, name: name?.trim() || undefined, status: 'NEEDS-ACTION' }])
    setQuery('')
    setOpen(false)
  }

  function removeAttendee(email: string) {
    onChange(value.filter((a) => a.email !== email))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && query.trim()) {
      e.preventDefault()
      // If a single suggestion is showing, take it; else treat the text as a raw email.
      if (matches.length === 1) addAttendee(matches[0].email, matches[0].name)
      else addAttendee(query)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Chips for current guests */}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {value.map((a) => (
            <li key={a.email}
              className="flex items-center gap-1.5 bg-gray-100 rounded-full pl-2 pr-1 py-1 text-xs text-gray-700">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[a.status || 'NEEDS-ACTION']}`}
                title={STATUS_LABEL[a.status || 'NEEDS-ACTION']} />
              <span className="truncate max-w-[12rem]">{a.name || a.email}</span>
              <button type="button" onClick={() => removeAttendee(a.email)} title="Remove guest"
                className="text-gray-400 hover:text-red-500 leading-none px-0.5">×</button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Add guest by name or email"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {matches.map((s) => (
            <li key={s.email}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); addAttendee(s.email, s.name) }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <span className="block text-sm text-gray-800">{s.name}</span>
                <span className="block text-xs text-gray-400">{s.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
