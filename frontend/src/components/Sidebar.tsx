// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useRef } from 'react'
import { logout as apiLogout, updateSubscriptionColor } from '../api/client'
import type { NotificationStatus } from '../hooks/useNotifications'
import type { CalendarInfo, User, AddressBook } from '../types/calendar'

async function setCalendarColor(calendarUrl: string, color: string) {
  const res = await fetch('/api/calendars/color', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ calendarUrl, color }),
  })
  if (!res.ok) throw new Error('Failed to update color')
}

export type ActiveTab = 'calendar' | 'tasks' | 'contacts'

interface Props {
  user: User
  calendars: CalendarInfo[]
  addressBooks: AddressBook[]
  visibleCalendarIds: Set<string>
  failedSubscriptionIds: Set<string>
  focusedDate: Date
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  onToggleCalendar: (id: string) => void
  onNavigate: (date: Date) => void
  onCreateEvent: () => void
  onCreateTask: () => void
  onCreateContact: () => void
  onColorChange: (cal: CalendarInfo, color: string) => void
  onAddSubscription: () => void
  onDeleteSubscription: (id: string) => void
  onHelp: () => void
  onLogout: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  notifStatus: NotificationStatus
  onEnableNotifications: () => void
}


export default function Sidebar({
  user,
  calendars,
  addressBooks,
  visibleCalendarIds,
  failedSubscriptionIds,
  focusedDate,
  activeTab,
  onTabChange,
  onToggleCalendar,
  onNavigate,
  onCreateEvent,
  onCreateTask,
  onCreateContact,
  onColorChange,
  onAddSubscription,
  onDeleteSubscription,
  onHelp,
  onLogout,
  theme,
  onToggleTheme,
  notifStatus,
  onEnableNotifications
}: Props) {

  async function handleLogout() {
    try { await apiLogout() } finally { onLogout() }
  }

  const mine = calendars.filter((c) => !c.isShared && !c.isExternal)
  const shared = calendars.filter((c) => c.isShared || c.isExternal)

  const visibleMine   = activeTab === 'tasks' ? mine.filter((c) => c.supportsTasks)   : mine.filter((c) => c.supportsEvents)
  const visibleShared = activeTab === 'tasks' ? shared.filter((c) => c.supportsTasks) : shared.filter((c) => c.supportsEvents)

  const createLabel = activeTab === 'tasks' ? 'Add task' : activeTab === 'contacts' ? 'New contact' : 'Create event'
  const onCreate = activeTab === 'tasks' ? onCreateTask : activeTab === 'contacts' ? onCreateContact : onCreateEvent

  return (
    <aside className="w-60 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col select-none no-print">
      {/* Tab bar — icon only, title tooltip */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-1 mb-3 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {/* Calendar */}
          <button title="Calendar" onClick={() => onTabChange('calendar')}
            className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${activeTab === 'calendar' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          {/* Tasks */}
          <button title="Tasks" onClick={() => onTabChange('tasks')}
            className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${activeTab === 'tasks' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
          {/* Contacts */}
          <button title="Contacts" onClick={() => onTabChange('contacts')}
            className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${activeTab === 'contacts' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <button onClick={onCreate}
          className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-3 py-2 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {createLabel}
        </button>
      </div>

      {/* Mini calendar — only in calendar mode */}
      {activeTab === 'calendar' && (
        <div className="px-2 pb-2">
          <MiniCalendar focusedDate={focusedDate} onSelectDate={onNavigate} />
        </div>
      )}

      {/* Calendar / task lists — hidden in contacts mode */}
      {activeTab !== 'contacts' && (
      <div className="flex-1 overflow-y-auto px-3 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3">
        {visibleMine.length > 0 && (
          <CalendarSection label="My calendars" calendars={visibleMine} visibleCalendarIds={visibleCalendarIds}
            onToggle={onToggleCalendar} onColorChange={onColorChange} />
        )}
        {visibleShared.length > 0 && (
          <CalendarSection
            label="Other calendars"
            calendars={visibleShared}
            visibleCalendarIds={visibleCalendarIds}
            failedSubscriptionIds={failedSubscriptionIds}
            onToggle={onToggleCalendar}
            onColorChange={onColorChange}
            onDeleteSubscription={onDeleteSubscription}
            isSharedSection
          />
        )}
        <button
          onClick={onAddSubscription}
          className="w-full flex items-center gap-2 px-2 py-1.5 mt-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add iCal subscription
        </button>

      </div>
      )}

      {/* Address book list — only in contacts mode */}
      {activeTab === 'contacts' && addressBooks.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-1">Address books</p>
          <ul className="space-y-0.5">
            {addressBooks.map(book => (
              <li key={book.id} className="px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{book.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {activeTab === 'contacts' && addressBooks.length === 0 && <div className="flex-1" />}

      {/* User / logout */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{user.username.charAt(0).toUpperCase()}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{user.username}</p>
          {notifStatus === 'default' && (
            <button onClick={onEnableNotifications} title="Enable event reminders"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          )}
          {notifStatus === 'denied' && (
            <span title="Reminders blocked — enable notifications for this site in your browser settings"
              className="text-gray-300 dark:text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.33-5M1 1l22 22" />
              </svg>
            </span>
          )}
          <button onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button onClick={onHelp} title="DAVx⁵ setup guide" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button onClick={handleLogout} title="Sign out" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}

// ─── Calendar Section ────────────────────────────────────────────────────────

function CalendarSection({ label, calendars, visibleCalendarIds, failedSubscriptionIds, onToggle, onColorChange, onDeleteSubscription, isSharedSection = false }: {
  label: string
  calendars: CalendarInfo[]
  visibleCalendarIds: Set<string>
  failedSubscriptionIds?: Set<string>
  onToggle: (id: string) => void
  onColorChange: (cal: CalendarInfo, color: string) => void
  onDeleteSubscription?: (id: string) => void
  isSharedSection?: boolean
}) {


  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-1">
        {label}
      </p>
      <ul className="space-y-0.5">
        {calendars.map((cal) => (
          <CalendarItem
            key={cal.id}
            calendar={cal}
            visible={visibleCalendarIds.has(cal.id)}
            failed={failedSubscriptionIds?.has(cal.id) ?? false}
            onToggle={() => onToggle(cal.id)}
            onColorChange={(color) => onColorChange(cal, color)}
            onDelete={cal.isExternal ? () => onDeleteSubscription?.(cal.id) : undefined}
            isShared={isSharedSection}
          />

        ))}
      </ul>
    </div>
  )
}

// ─── Calendar Item ────────────────────────────────────────────────────────────

function CalendarItem({ calendar, visible, failed, onToggle, onColorChange, onDelete, isShared }: {
  calendar: CalendarInfo
  visible: boolean
  failed?: boolean
  onToggle: () => void
  onColorChange: (color: string) => void
  onDelete?: () => void
  isShared: boolean
}) {


  const [saving, setSaving] = useState(false)
  const [showUrl, setShowUrl] = useState(false)
  const [copied, setCopied] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(calendar.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context) — the URL is still shown for manual copy.
    }
  }

  // Debounce the color write — the color input fires on every drag pixel.
  // Subscriptions store their color in subscriptions.json (PATCH /api/subscriptions);
  // Davis calendars store it on the server via PROPPATCH.
  function handleColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const color = e.target.value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        if (calendar.isExternal) {
          await updateSubscriptionColor(calendar.id, color)
        } else {
          await setCalendarColor(calendar.url, color)
        }
        onColorChange(color)
      } catch (err) {
        console.error('Failed to update calendar color:', err)
      } finally {
        setSaving(false)
      }
    }, 500)
  }

  return (
    <li className={`relative flex items-center gap-1 group rounded-lg ${isShared ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}>
      {/* Toggle + label */}
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span
          className="w-3.5 h-3.5 rounded-sm flex-shrink-0 flex items-center justify-center border-2 transition-colors"
          style={{ borderColor: calendar.color, backgroundColor: visible ? calendar.color : 'transparent' }}
        >
          {visible && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        {/* Shared icon */}
        {isShared && (
          <svg className="w-3 h-3 text-gray-400 flex-shrink-0 -ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}

        <span className={`text-sm leading-snug truncate flex-1 ${visible ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'} ${isShared ? 'text-gray-500 dark:text-gray-400' : ''}`}>
          {calendar.displayName}
        </span>

        {/* Failed-to-load warning for subscriptions whose feed couldn't be fetched */}
        {failed && (
          <span className="flex-shrink-0" title="Couldn't load this calendar's feed — check the subscription URL">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </span>
        )}
      </button>

      {/* Color picker — own Davis calendars and iCal subscriptions (both store a color).
          Shared read-only Davis calendars are excluded. */}
      {(!isShared || calendar.isExternal) && (
        <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
          <button
            type="button"
            title="Change color"
            disabled={saving}
            onClick={() => colorInputRef.current?.click()}
            className="w-4 h-4 rounded-full border-2 border-white shadow hover:scale-110 transition-transform disabled:opacity-50"
            style={{ backgroundColor: calendar.color }}
          />
          <input
            ref={colorInputRef}
            type="color"
            defaultValue={calendar.color}
            onChange={handleColorChange}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
          />
        </div>
      )}

      {/* Show subscription URL — only for external */}
      {calendar.isExternal && (
        <button
          title="Show feed URL"
          onClick={(e) => { e.stopPropagation(); setShowUrl((v) => !v) }}
          className="flex-shrink-0 opacity-60 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-700 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      {/* Delete subscription — only for external */}
      {onDelete && (
        <button
          title="Remove subscription"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="flex-shrink-0 opacity-60 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all mr-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {/* Feed URL popover */}
      {showUrl && calendar.isExternal && (
        <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Feed URL</p>
          <div className="flex items-start gap-1.5">
            <span className="flex-1 text-[11px] text-gray-600 dark:text-gray-300 break-all leading-snug">{calendar.url}</span>
            <button
              onClick={(e) => { e.stopPropagation(); copyUrl() }}
              title="Copy URL"
              className="flex-shrink-0 text-[10px] font-medium text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </li>

  )
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['S','M','T','W','T','F','S']

function MiniCalendar({ focusedDate, onSelectDate }: { focusedDate: Date; onSelectDate: (date: Date) => void }) {
  const [viewYear, setViewYear] = useState(focusedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(focusedDate.getMonth())
  const today = new Date()

  // Sync to main calendar when it navigates to a new month
  const focusedMonth = focusedDate.getMonth()
  const focusedYear = focusedDate.getFullYear()
  if (focusedMonth !== viewMonth || focusedYear !== viewYear) {
    setViewMonth(focusedMonth)
    setViewYear(focusedYear)
  }

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function isToday(day: number) {
    return day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  }

  function isFocused(day: number) {
    return day === focusedDate.getDate() && viewMonth === focusedDate.getMonth() && viewYear === focusedDate.getFullYear()
  }

  return (
    <div className="px-1 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => { const d = new Date(viewYear, viewMonth - 1, 1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs"
        >‹</button>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button
          onClick={() => { const d = new Date(viewYear, viewMonth + 1, 1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs"
        >›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) =>
          day === null ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => onSelectDate(new Date(viewYear, viewMonth, day))}
              className={`
                w-6 h-6 mx-auto flex items-center justify-center rounded-full text-[11px] font-medium transition-colors
                ${isToday(day) ? 'bg-blue-600 text-white' : isFocused(day) && !isToday(day) ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
              `}
            >
              {day}
            </button>
          )
        )}
      </div>
    </div>
  )
}
