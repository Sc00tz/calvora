// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef } from 'react'
import { getEvents } from '../api/client'
import type { CalendarInfo } from '../types/calendar'

const DEFAULT_REMINDER_MINUTES = 15
const POLL_INTERVAL_MS = 60_000 // check every minute
const LOOK_AHEAD_MS = 2 * 60 * 60 * 1000 // fetch next 2 hours of events

// Tracks which event+time combos we've already notified so we don't repeat
const notified = new Set<string>()

export function useNotifications(calendars: CalendarInfo[], visibleCalendarIds: Set<string>) {
  const permissionRef = useRef<NotificationPermission>('default')

  // Request permission once on mount
  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      permissionRef.current = 'granted'
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p
      })
    } else {
      permissionRef.current = Notification.permission
    }
  }, [])

  useEffect(() => {
    if (!('Notification' in window)) return
    const visibleCalendars = calendars.filter((c) => visibleCalendarIds.has(c.id))
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
          if (diffMs >= 0 && diffMs < POLL_INTERVAL_MS && !notified.has(notifyKey)) {
            notified.add(notifyKey)
            const label = reminderMinutes === 0
              ? 'Starting now'
              : reminderMinutes < 60
              ? `In ${reminderMinutes} minutes`
              : reminderMinutes === 60
              ? 'In 1 hour'
              : `In ${reminderMinutes / 60} hours`

            new Notification(event.title, {
              body: `${label}${event.location ? ` · ${event.location}` : ''}`,
              icon: '/favicon.ico',
              tag: notifyKey, // prevents duplicates at OS level too
            })
          }
        }
      } catch {
        // Silently ignore — notification failures shouldn't disrupt the app
      }
    }

    checkUpcoming()
    const interval = setInterval(checkUpcoming, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [calendars, visibleCalendarIds])
}
