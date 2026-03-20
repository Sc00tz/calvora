// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useCallback } from 'react'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../api/client'
import type { CalendarInfo, CalendarEvent, CreateEventBody, UpdateEventBody } from '../types/calendar'

export function useEvents() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(
    async (visibleCalendars: CalendarInfo[], start: Date, end: Date): Promise<CalendarEvent[]> => {
      if (visibleCalendars.length === 0) return []
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          visibleCalendars.map((cal) =>
            getEvents(cal.url, start.toISOString(), end.toISOString()).then((events) =>
              events.map((e) => ({ ...e, calendarColor: cal.color }))
            )
          )
        )
        return results.flat()
      } catch (err: any) {
        setError(err?.response?.data?.error ?? 'Failed to load events')
        return []
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const addEvent = useCallback(async (body: CreateEventBody): Promise<CalendarEvent> => {
    const event = await createEvent(body)
    return event
  }, [])

  const editEvent = useCallback(async (uid: string, body: UpdateEventBody): Promise<void> => {
    await updateEvent(uid, body)
  }, [])

  const removeEvent = useCallback(async (uid: string, eventUrl: string, etag?: string): Promise<void> => {
    await deleteEvent(uid, eventUrl, etag)
  }, [])

  return { fetchEvents, addEvent, editEvent, removeEvent, loading, error }
}
