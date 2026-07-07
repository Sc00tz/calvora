// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState, useCallback } from 'react'
import { getEvents } from '../api/client'
import type { CalendarInfo } from '../types/calendar'

const DEFAULT_REMINDER_MINUTES = 15
const POLL_INTERVAL_MS = 60_000 // check every minute
const LOOK_AHEAD_MS = 2 * 60 * 60 * 1000 // fetch next 2 hours of events
// Cap the dedupe set so a long-lived tab doesn't leak memory; evict oldest first.
const NOTIFIED_MAX = 500

export type NotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied'

export function useNotifications(calendars: CalendarInfo[], visibleCalendarIds: Set<string>) {
  const permissionRef = useRef<NotificationPermission>('default')
  const [status, setStatus] = useState<NotificationStatus>(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  // Bounded insertion-ordered dedupe of already-fired notify keys (per hook instance).
  const notifiedRef = useRef<Set<string>>(new Set())

  const rememberNotified = useCallback((key: string) => {
    const set = notifiedRef.current
    set.add(key)
    if (set.size > NOTIFIED_MAX) {
      // Sets preserve insertion order — drop the oldest entries.
      const excess = set.size - NOTIFIED_MAX
      let i = 0
      for (const k of set) { if (i++ >= excess) break; set.delete(k) }
    }
  }, [])

  useEffect(() => {
    permissionRef.current = status === 'unsupported' ? 'denied' : status
  }, [status])

  // Explicit opt-in: prompt the browser for permission on user action, not silently on load.
  const requestPermission = useCallback(() => {
    if (!('Notification' in window)) return
    Notification.requestPermission().then((p) => {
      permissionRef.current = p
      setStatus(p)
    })
  }, [])

  // Sync initial permission (in case it changed elsewhere), but don't auto-prompt.
  useEffect(() => {
    if (!('Notification' in window)) return
    permissionRef.current = Notification.permission
    setStatus(Notification.permission)
  }, [])

  useEffect(() => {
    if (!('Notification' in window)) return
    // Only poll real Davis event calendars. Virtual (birthdays) and external (iCal
    // subscription) calendars aren't Davis collections — querying /api/events for them 502s.
    const visibleCalendars = calendars.filter(
      (c) => visibleCalendarIds.has(c.id) && c.supportsEvents && !c.isVirtual && !c.isExternal
    )
    if (visibleCalendars.length === 0) return

    async function checkUpcoming() {
      if (permissionRef.current !== 'granted') return

      const now = new Date()
      const end = new Date(now.getTime() + LOOK_AHEAD_MS)

      try {
        const results = await Promise.all(
          visibleCalendars.map((cal) =>
            getEvents(cal.url, now.toISOString(), end.toISOString())
          )
        )
        const events = results.flat()

        for (const event of events) {
          if (event.allDay) continue

          const reminderMinutes = event.reminder ?? DEFAULT_REMINDER_MINUTES
          const eventStart = new Date(event.start)
          const notifyAt = new Date(eventStart.getTime() - reminderMinutes * 60 * 1000)
          const notifyKey = `${event.uid}:${reminderMinutes}`

          // Fire if we're within the current poll window of the notify time
          const diffMs = notifyAt.getTime() - now.getTime()
          if (diffMs >= 0 && diffMs < POLL_INTERVAL_MS && !notifiedRef.current.has(notifyKey)) {
            rememberNotified(notifyKey)
            const label = reminderMinutes === 0
              ? 'Starting now'
              : reminderMinutes < 60
              ? `In ${reminderMinutes} minutes`
              : reminderMinutes === 60
              ? 'In 1 hour'
              : `In ${reminderMinutes / 60} hours`

            const notification = new Notification(event.title, {
              body: `${label}${event.location ? ` · ${event.location}` : ''}`,
              icon: '/favicon.ico',
              tag: notifyKey, // prevents duplicates at OS level too
            })
            // Clicking the notification focuses the Calvora tab.
            notification.onclick = () => { window.focus(); notification.close() }
          }
        }
      } catch {
        // Silently ignore — notification failures shouldn't disrupt the app
      }
    }

    checkUpcoming()
    const interval = setInterval(checkUpcoming, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [calendars, visibleCalendarIds, rememberNotified])

  return { status, requestPermission }
}
