// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, FormEvent } from 'react'
import LocationSearch from './LocationSearch'
import AttendeesField from './AttendeesField'
import { getFreeBusy } from '../api/client'
import type { CalendarEvent, CalendarInfo, CreateEventBody, UpdateEventBody, Attendee } from '../types/calendar'

interface Props {
  event: CalendarEvent | null
  defaultStart?: Date
  defaultEnd?: Date
  defaultAllDay?: boolean
  prefill?: Partial<CreateEventBody>
  editScope?: 'all' | 'this' | 'following'
  calendars: CalendarInfo[]
  onSave: (body: CreateEventBody | UpdateEventBody, isNew: boolean) => Promise<void>
  onDelete?: (event: CalendarEvent, editScope?: 'all' | 'this' | 'following') => Promise<void>
  onDuplicate?: (event: CalendarEvent) => void
  onCopy?: (event: CalendarEvent) => void
  onClose: () => void
}

const REMINDER_OPTIONS = [
  { label: 'No reminder', value: '' },
  { label: '5 minutes before', value: '5' },
  { label: '15 minutes before', value: '15' },
  { label: '30 minutes before', value: '30' },
  { label: '1 hour before', value: '60' },
  { label: '2 hours before', value: '120' },
  { label: '1 day before', value: '1440' },
]

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function EventModal({ event, defaultStart, defaultEnd, defaultAllDay = false, prefill, editScope, calendars, onSave, onDelete, onDuplicate, onCopy, onClose }: Props) {
  const isNew = event === null
  const writableCalendars = calendars.filter((c) => c.canWrite)

  const [title, setTitle] = useState('')
  const [calendarUrl, setCalendarUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [rrule, setRrule] = useState('')
  const [reminder, setReminder] = useState('')
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [conflicts, setConflicts] = useState<{ start: string; end: string }[]>([])

  useEffect(() => {
    if (event) {
      // For "edit all", use the master event's original start/end so the user
      // edits the series root rather than the clicked occurrence's date.
      const useAllDay = editScope === 'all' && event.masterAllDay !== undefined
        ? event.masterAllDay : event.allDay
      const useStart = editScope === 'all' && event.masterStart ? event.masterStart : event.start
      const useEnd   = editScope === 'all' && event.masterEnd   ? event.masterEnd   : event.end

      setTitle(event.title)
      setCalendarUrl(event.calendarUrl)
      setAllDay(useAllDay)
      setDescription(event.description ?? '')
      setLocation(event.location ?? '')
      setRrule(event.rrule ?? '')
      setReminder(event.reminder !== undefined ? String(event.reminder) : '')
      setAttendees(event.attendees ?? [])
      if (useAllDay) {
        setStart(useStart.slice(0, 10))
        setEnd(useEnd.slice(0, 10))
      } else {
        setStart(toLocalDatetimeValue(new Date(useStart)))
        setEnd(toLocalDatetimeValue(new Date(useEnd)))
      }
    } else {
      const s = defaultStart ?? new Date()
      const e = defaultEnd ?? new Date(s.getTime() + 60 * 60 * 1000)
      setAllDay(defaultAllDay)
      setStart(defaultAllDay ? toDateValue(s) : toLocalDatetimeValue(s))
      setEnd(defaultAllDay ? toDateValue(e) : toLocalDatetimeValue(e))
      // Apply duplicate/prefill values when present, else fall back to the first calendar.
      setTitle(prefill?.title ?? '')
      setDescription(prefill?.description ?? '')
      setLocation(prefill?.location ?? '')
      setRrule(prefill?.rrule ?? '')
      setReminder(prefill?.reminder !== undefined ? String(prefill.reminder) : '')
      setAttendees(prefill?.attendees ?? [])
      setCalendarUrl(prefill?.calendarUrl ?? writableCalendars[0]?.url ?? '')
    }
  }, [event]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check the user's own calendars for conflicts with the selected time window.
  // Debounced; timed events only; the event being edited is excluded so it doesn't
  // flag itself. Best-effort — failures (e.g. a calendar not supporting free-busy) are silent.
  useEffect(() => {
    if (allDay || !start || !end) { setConflicts([]); return }
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      setConflicts([]); return
    }
    const ownCalendarUrls = calendars
      .filter((c) => c.supportsEvents && !c.isExternal && !c.isVirtual)
      .map((c) => c.url)
    if (ownCalendarUrls.length === 0) { setConflicts([]); return }

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const busy = await getFreeBusy(ownCalendarUrls, startDate.toISOString(), endDate.toISOString())
        if (cancelled) return
        const s = startDate.getTime()
        const e = endDate.getTime()
        // Overlap = busy.start < newEnd && busy.end > newStart. Ignore a block that exactly
        // matches this event's own time (editing an existing event shouldn't flag itself).
        const overlapping = busy.filter((b) => {
          const bs = new Date(b.start).getTime()
          const be = new Date(b.end).getTime()
          if (event && bs === s && be === e) return false
          return bs < e && be > s
        })
        setConflicts(overlapping)
      } catch {
        if (!cancelled) setConflicts([])
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [start, end, allDay, calendars, event])

  function handleAllDayToggle() {
    const next = !allDay
    setAllDay(next)
    if (next) {
      setStart(start.slice(0, 10))
      setEnd(end.slice(0, 10))
    } else {
      setStart(start + 'T12:00')
      setEnd(end + 'T13:00')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const startIso = allDay ? start : new Date(start).toISOString()
      const endIso = allDay ? end : new Date(end).toISOString()
      const reminderVal = reminder ? parseInt(reminder, 10) : undefined
      // Author timed events in the browser's IANA zone so DTSTART;TZID is written correctly,
      // independent of the server's timezone. All-day events carry no zone.
      const timeZone = allDay ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone

      if (isNew) {
        await onSave({
          calendarUrl,
          title,
          start: startIso,
          end: endIso,
          allDay,
          timeZone,
          description: description || undefined,
          location: location || undefined,
          rrule: rrule || undefined,
          reminder: reminderVal,
          attendees: attendees.length > 0 ? attendees : undefined,
        } satisfies CreateEventBody, true)
      } else {
        await onSave({
          uid: event!.uid,
          eventUrl: event!.url,
          calendarUrl: event!.calendarUrl,
          title,
          start: startIso,
          end: endIso,
          allDay,
          timeZone,
          description: description || undefined,
          location: location || undefined,
          // Don't carry the rrule when editing only this occurrence
          rrule: editScope === 'this' ? undefined : (rrule || undefined),
          reminder: reminderVal,
          attendees: attendees.length > 0 ? attendees : undefined,
          etag: event!.etag,
          editScope,
          occurrenceStart: event!.occurrenceStart,
          masterUid: event!.masterUid,
        } satisfies UpdateEventBody, false)
      }
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event || !onDelete) return
    setDeleting(true)
    try {
      await onDelete(event, editScope)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to delete event')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const selectedCal = writableCalendars.find((c) => c.url === calendarUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">{isNew ? 'New event' : 'Edit event'}</h2>
            {editScope && (
              <p className="text-xs text-gray-400 mt-0.5">
                {editScope === 'this' && 'This occurrence only'}
                {editScope === 'following' && 'This and following occurrences'}
                {editScope === 'all' && 'All occurrences in the series'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-lg font-medium border-0 border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-500 placeholder-gray-300"
            required
            autoFocus
          />

          {/* Calendar selector */}
          {isNew && writableCalendars.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Calendar</label>
              <div className="relative flex items-center">
                {selectedCal && (
                  <span className="absolute left-3 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCal.color }} />
                )}
                <select
                  value={calendarUrl}
                  onChange={(e) => setCalendarUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pl-8 pr-3"
                >
                  {writableCalendars.map((c) => (
                    <option key={c.id} value={c.url}>{c.displayName}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* All day */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={allDay} onChange={handleAllDayToggle} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">All day</span>
          </label>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input type={allDay ? 'date' : 'datetime-local'} value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input type={allDay ? 'date' : 'datetime-local'} value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
          </div>

          {/* Conflict warning — overlaps with the user's own busy times */}
          {conflicts.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <span>
                Overlaps {conflicts.length === 1 ? 'an existing event' : `${conflicts.length} existing events`} on your calendars.
              </span>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <LocationSearch value={location} onChange={setLocation} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea placeholder="Add description" value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Guests */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Guests</label>
            <AttendeesField value={attendees} onChange={setAttendees} />
          </div>

          {/* Repeat — hidden when editing only this occurrence */}
          {editScope !== 'this' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Repeat</label>
              <select value={rrule} onChange={(e) => setRrule(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Does not repeat</option>
                <option value="FREQ=DAILY">Daily</option>
                <option value="FREQ=WEEKLY">Weekly</option>
                <option value="FREQ=MONTHLY">Monthly</option>
                <option value="FREQ=YEARLY">Yearly</option>
              </select>
            </div>
          )}

          {/* Reminder */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reminder</label>
            <select value={reminder} onChange={(e) => setReminder(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 pb-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!isNew && onCopy && event && (
              <button type="button" title="Copy event (paste with Ctrl/Cmd-V on a date)"
                onClick={() => { onCopy(event); onClose() }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
                Copy
              </button>
            )}
            {!isNew && onDuplicate && event && (
              <button type="button" title="Duplicate event"
                onClick={() => { onDuplicate(event); onClose() }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
                Duplicate
              </button>
            )}
            {!isNew && onDelete && (
              confirmDelete ? (
                <button type="button" disabled={deleting} onClick={handleDelete}
                  className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium transition-colors">
                  Delete
                </button>
              )
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
