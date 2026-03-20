// SPDX-License-Identifier: GPL-3.0-or-later
import { useRef, useEffect, useState, useCallback, MutableRefObject } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction'
import type { EventDropArg } from '@fullcalendar/core'
import type { EventClickArg, EventInput, DatesSetArg } from '@fullcalendar/core'
import { getEvents, getTasks, updateEvent, searchEvents } from '../api/client'
import type { CalendarInfo, CalendarEvent, CalendarTask, Contact, UpdateEventBody } from '../types/calendar'

interface CalendarHandle {
  refetchEvents: () => void
  navigateTo: (date: Date) => void
}

interface Props {
  visibleCalendars: CalendarInfo[]
  birthdayContacts: Contact[]
  onClickSlot: (start: Date, end: Date, allDay: boolean) => void
  onClickEvent: (event: CalendarEvent) => void
  onClickTask: (task: CalendarTask) => void
  onDatesChange: (date: Date) => void
  calendarRef: MutableRefObject<CalendarHandle | null>
}

export default function CalendarView({ visibleCalendars, birthdayContacts, onClickSlot, onClickEvent, onClickTask, onDatesChange, calendarRef }: Props) {
  const fcRef = useRef<FullCalendar>(null)
  const eventMapRef = useRef<Map<string, CalendarEvent>>(new Map())
  const taskMapRef = useRef<Map<string, CalendarTask>>(new Map())
  const [fcEvents, setFcEvents] = useState<EventInput[]>([])
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null)

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CalendarEvent[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const q = searchQuery.trim()
    if (!q || visibleCalendars.length === 0) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      setSearchOpen(true)
      try {
        const calendarUrls = visibleCalendars
          .filter((c) => c.supportsEvents)
          .map((c) => c.url)
        const results = await searchEvents(q, calendarUrls)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [searchQuery, visibleCalendars])

  function handleSearchResultClick(event: CalendarEvent) {
    setSearchQuery('')
    setSearchOpen(false)
    // Navigate to event date in day view
    const date = new Date(event.start)
    fcRef.current?.getApi().changeView('timeGridDay', date)
    onClickEvent(event)
  }

  // ── Calendar loading ──────────────────────────────────────────────────────
  const loadEvents = useCallback(async (start: Date, end: Date, calendars: CalendarInfo[]) => {
    if (calendars.length === 0) { setFcEvents([]); return }
    try {
      const nativeEventCalendars = calendars.filter((c) => c.supportsEvents && !c.isExternal && !c.isVirtual)
      const externalCalendars = calendars.filter((c) => c.isExternal)
      const taskCalendars = calendars.filter((c) => c.supportsTasks)
      const virtualBirthdayCal = calendars.find((c) => c.isVirtual && c.id === 'virtual-birthdays')

      const [nativeResults, externalResults, taskResults, virtualBirthdayResults] = await Promise.all([
        Promise.all(
          nativeEventCalendars.map((cal) =>
            getEvents(cal.url, start.toISOString(), end.toISOString()).then((evts) =>
              evts.map((e) => ({ event: e, cal, isExternal: false }))
            )
          )
        ),
        Promise.all(
          externalCalendars.map(async (cal) => {
            try {
              const { getExternalIcal } = await import('../api/client')
              // @ts-ignore
              const ICAL = (await import('ical.js')).default
              const icsData = await getExternalIcal(cal.url)
              const jcalData = ICAL.parse(icsData)
              const comp = new ICAL.Component(jcalData)
              const vevents = comp.getAllSubcomponents('vevent')

              return vevents.map((vevent: any) => {
                const event = new ICAL.Event(vevent)

                return {
                  event: {
                    uid: event.uid,
                    title: event.summary,
                    start: event.startDate.toJSDate().toISOString(),
                    end: event.endDate.toJSDate().toISOString(),
                    allDay: event.startDate.isDate,
                    description: event.description,
                    location: event.location,
                    calendarUrl: cal.url,
                    url: '',
                  } as CalendarEvent,
                  cal,
                  isExternal: true
                }
              })
            } catch (err) {
              console.error('Failed to load external calendar:', cal.url, err)
              return []
            }
          })
        ),
        Promise.all(
          taskCalendars.map((cal) =>
            getTasks(cal.url).then((tasks) => tasks.map((t) => ({ task: t, cal })))
          )
        ),
        (async () => {
          if (!virtualBirthdayCal) return []
          try {
            const contacts = birthdayContacts
            const virtualEvents: { event: CalendarEvent, cal: CalendarInfo, isExternal: boolean }[] = []

            const startYear = start.getFullYear()
            const endYear = end.getFullYear()
            for (const contact of contacts) {
              if (contact.birthday) {
                const bparts = contact.birthday.split('-')
                if (bparts.length === 3) {
                  const bMonth = bparts[1]
                  const bDay = bparts[2]
                  for (let year = startYear; year <= endYear; year++) {
                    const dateStr = `${year}-${bMonth}-${bDay}`
                    const date = new Date(dateStr)
                    if (date >= start && date <= end) {
                      virtualEvents.push({
                        event: {
                          uid: `bday-${contact.uid}-${year}`,
                          title: `🎂 ${contact.fullName}'s Birthday`,
                          start: dateStr,
                          end: dateStr,
                          allDay: true,
                          calendarUrl: virtualBirthdayCal.url,
                          url: '',
                        } as CalendarEvent,
                        cal: virtualBirthdayCal,
                        isExternal: true
                      })
                    }
                  }
                }
              }
              if (contact.anniversary) {
                const aparts = contact.anniversary.split('-')
                if (aparts.length === 3) {
                  const aMonth = aparts[1]
                  const aDay = aparts[2]
                  for (let year = startYear; year <= endYear; year++) {
                    const dateStr = `${year}-${aMonth}-${aDay}`
                    const date = new Date(dateStr)
                    if (date >= start && date <= end) {
                      virtualEvents.push({
                        event: {
                          uid: `anniv-${contact.uid}-${year}`,
                          title: `💍 ${contact.fullName}'s Anniversary`,
                          start: dateStr,
                          end: dateStr,
                          allDay: true,
                          calendarUrl: virtualBirthdayCal.url,
                          url: '',
                        } as CalendarEvent,
                        cal: virtualBirthdayCal,
                        isExternal: true
                      })
                    }
                  }
                }
              }
            }
            return virtualEvents

          } catch (err) {
            console.error('Failed to load virtual birthdays:', err)
            return []
          }
        })()
      ])


      eventMapRef.current.clear()
      taskMapRef.current.clear()

      const allEventResults = [
        ...nativeResults.flat(),
        ...externalResults.flat(),
        ...virtualBirthdayResults
      ]


      const eventInputs: EventInput[] = allEventResults.map(({ event: e, cal, isExternal }) => {
        if (!isExternal) eventMapRef.current.set(e.uid, e)
        return {
          id: e.uid,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          backgroundColor: cal.color,
          borderColor: cal.color,
          editable: !isExternal, // external calendars are read-only
        }
      })


      // Tasks with due dates in the current view range
      const taskInputs: EventInput[] = taskResults.flat()
        .filter(({ task }) => {
          if (!task.due) return false
          const due = new Date(task.due)
          return due >= start && due <= end
        })
        .map(({ task: t, cal }) => {
          taskMapRef.current.set(`task:${t.uid}`, t)
          const isDone = t.status === 'COMPLETED' || t.status === 'CANCELLED'
          const prefix = isDone ? '✓ ' : '○ '
          const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(t.due!)
          return {
            id: `task:${t.uid}`,
            title: prefix + t.title,
            start: t.due,
            allDay: isDateOnly,
            backgroundColor: isDone ? '#9ca3af' : cal.color + 'bb',
            borderColor: isDone ? '#9ca3af' : cal.color,
            textDecoration: isDone ? 'line-through' : undefined,
            classNames: ['fc-task-event'],
          }
        })

      setFcEvents([...eventInputs, ...taskInputs])
    } catch (err) {
      console.error('Failed to fetch events:', err)
    }
  }, [birthdayContacts])

  useEffect(() => {
    if (dateRange) loadEvents(dateRange.start, dateRange.end, visibleCalendars)
  }, [visibleCalendars, dateRange, loadEvents])

  // Expose handles to parent
  useEffect(() => {
    calendarRef.current = {
      refetchEvents: () => dateRange && loadEvents(dateRange.start, dateRange.end, visibleCalendars),
      navigateTo: (date: Date) => fcRef.current?.getApi().gotoDate(date),
    }
  })

  function handleDatesSet(arg: DatesSetArg) {
    setDateRange({ start: arg.start, end: arg.end })
    const mid = new Date((arg.start.getTime() + arg.end.getTime()) / 2)
    onDatesChange(mid)
  }

  function handleDateClick(arg: DateClickArg) {
    if (arg.view.type === 'dayGridMonth') {
      fcRef.current?.getApi().changeView('timeGridDay', arg.date)
      return
    }
    const start = arg.date
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    onClickSlot(start, end, arg.allDay)
  }

  function handleEventClick(arg: EventClickArg) {
    if (arg.event.id.startsWith('task:')) {
      const task = taskMapRef.current.get(arg.event.id)
      if (task) onClickTask(task)
      return
    }
    const event = eventMapRef.current.get(arg.event.id)
    if (event) onClickEvent(event)
  }

  async function handleEventDrop(arg: EventDropArg) {
    if (arg.event.id.startsWith('task:')) { arg.revert(); return }
    const event = eventMapRef.current.get(arg.event.id)
    if (!event) { arg.revert(); return }

    const newStart = arg.event.start
    if (!newStart) { arg.revert(); return }
    const newEnd = arg.event.end ?? newStart

    const body: UpdateEventBody = {
      uid: event.uid,
      eventUrl: event.url,
      calendarUrl: event.calendarUrl,
      title: event.title,
      start: newStart.toISOString(),
      end: newEnd.toISOString(),
      allDay: arg.event.allDay,
      description: event.description,
      location: event.location,
      // Drag-drop on a recurring occurrence → move only this instance
      rrule: event.isOccurrence ? undefined : event.rrule,
      reminder: event.reminder,
      etag: event.etag,
      editScope: event.isOccurrence ? 'this' : undefined,
      occurrenceStart: event.occurrenceStart,
      masterUid: event.masterUid,
    }

    try {
      await updateEvent(event.uid, body)
      eventMapRef.current.set(event.uid, { ...event, start: newStart.toISOString(), end: newEnd.toISOString(), allDay: arg.event.allDay })
    } catch (err) {
      console.error('Failed to move event:', err)
      arg.revert()
    }
  }

  async function handleEventResize(arg: EventResizeDoneArg) {
    if (arg.event.id.startsWith('task:')) { arg.revert(); return }
    const event = eventMapRef.current.get(arg.event.id)
    if (!event || !arg.event.start || !arg.event.end) { arg.revert(); return }

    const body: UpdateEventBody = {
      uid: event.uid,
      eventUrl: event.url,
      calendarUrl: event.calendarUrl,
      title: event.title,
      start: arg.event.start.toISOString(),
      end: arg.event.end.toISOString(),
      allDay: arg.event.allDay,
      description: event.description,
      location: event.location,
      // Resize on a recurring occurrence → resize only this instance
      rrule: event.isOccurrence ? undefined : event.rrule,
      reminder: event.reminder,
      etag: event.etag,
      editScope: event.isOccurrence ? 'this' : undefined,
      occurrenceStart: event.occurrenceStart,
      masterUid: event.masterUid,
    }

    try {
      await updateEvent(event.uid, body)
      eventMapRef.current.set(event.uid, { ...event, start: arg.event.start.toISOString(), end: arg.event.end.toISOString() })
    } catch (err) {
      console.error('Failed to resize event:', err)
      arg.revert()
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search bar */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0" ref={searchRef}>
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
            placeholder="Search events…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Results dropdown */}
          {searchOpen && searchQuery.trim() && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden max-h-80 overflow-y-auto">
              {searchLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No events found</p>
              ) : (
                searchResults.map((event) => {
                  const cal = visibleCalendars.find((c) => c.url === event.calendarUrl)
                  const date = new Date(event.start)
                  const dateStr = date.toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                    ...(event.allDay ? {} : { hour: 'numeric', minute: '2-digit' }),
                  })
                  return (
                    <button
                      key={event.uid}
                      onMouseDown={(e) => { e.preventDefault(); handleSearchResultClick(event) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cal?.color ?? '#3788d8' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {dateStr}{event.location ? `  ·  ${event.location}` : ''}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 px-5 pb-5">
        <FullCalendar
          ref={fcRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
          height="100%"
          navLinks={true}
          navLinkDayClick={(date) => fcRef.current?.getApi().changeView('timeGridDay', date)}
          selectable={true}
          editable={true}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          datesSet={handleDatesSet}
          events={fcEvents}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          nowIndicator={true}
          dayMaxEvents={4}
          scrollTime="08:00:00"
        />
      </div>
    </div>
  )
}
