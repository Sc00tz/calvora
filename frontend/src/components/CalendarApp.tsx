// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback, useRef } from 'react'
import { useCalendars } from '../hooks/useCalendars'
import { createEvent, updateEvent, deleteEvent, createTask, updateTask, deleteTask, createContact, updateContact, deleteContact } from '../api/client'
import Layout from './Layout'
import Sidebar, { ActiveTab } from './Sidebar'
import CalendarView from './CalendarView'
import TasksView from './TasksView'
import ContactsView from './ContactsView'
import EventModal from './EventModal'
import TaskModal from './TaskModal'
import ContactModal from './ContactModal'
import SubscriptionModal from './SubscriptionModal'
import HelpModal from './HelpModal'
import RecurrenceDialog from './RecurrenceDialog'
import ShortcutsHelp from './ShortcutsHelp'
import UndoToast from './UndoToast'
import { useNotifications } from '../hooks/useNotifications'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useUndo } from '../hooks/useUndo'
import { deleteSubscription, getAllContacts } from '../api/client'
import type { User, CalendarEvent, CalendarInfo, CreateEventBody, UpdateEventBody, CalendarTask, CreateTaskBody, UpdateTaskBody, Contact, AddressBook, CreateContactBody, UpdateContactBody, CalendarHandle } from '../types/calendar'


interface Props {
  user: User
  onLogout: () => void
}

type EventModalState =
  | { mode: 'closed' }
  | { mode: 'create'; start: Date; end: Date; allDay: boolean; prefill?: Partial<CreateEventBody> }
  | { mode: 'recurring-choice'; event: CalendarEvent }
  | { mode: 'edit'; event: CalendarEvent; editScope?: 'all' | 'this' | 'following' }

type TaskModalState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; task: CalendarTask }

type ContactModalState =
  | { mode: 'closed' }
  | { mode: 'create'; defaultAddressBookUrl?: string }
  | { mode: 'edit'; contact: Contact }

export default function CalendarApp({ user, onLogout }: Props) {
  const { calendars, loading: calendarsLoading, refetch: refetchCalendars } = useCalendars()
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar')
  const [eventModal, setEventModal]     = useState<EventModalState>({ mode: 'closed' })
  const [taskModal, setTaskModal]       = useState<TaskModalState>({ mode: 'closed' })
  const [contactModal, setContactModal] = useState<ContactModalState>({ mode: 'closed' })
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set())
  const [helpOpen, setHelpOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)
  const [focusedDate, setFocusedDate] = useState(new Date())

  const [addressBooks, setAddressBooks] = useState<AddressBook[]>([])
  const [birthdayContacts, setBirthdayContacts] = useState<Contact[]>([])
  // IDs of subscription calendars whose feed failed to load, for a sidebar warning badge.
  const [failedSubscriptionIds, setFailedSubscriptionIds] = useState<Set<string>>(new Set())
  const calendarRef      = useRef<CalendarHandle | null>(null)
  const tasksViewRefetch = useRef<(() => void) | null>(null)
  const contactsRefetch  = useRef<(() => void) | null>(null)
  // Pre-edit snapshot of the event being edited, captured at modal-open, used to build the undo inverse.
  const editSnapshotRef  = useRef<CalendarEvent | null>(null)
  // In-app clipboard for copy/paste of events (not the OS clipboard).
  const eventClipboardRef = useRef<CalendarEvent | null>(null)
  // The most recently opened event — the implicit source for Ctrl/Cmd-C.
  const lastFocusedEventRef = useRef<CalendarEvent | null>(null)

  useNotifications(calendars, visibleCalendarIds)

  // Undo: refresh whatever view is active after an inverse op completes.
  const { toast: undoToast, pushUndo, runUndo, dismiss: dismissUndo } = useUndo(() => {
    calendarRef.current?.refetchEvents()
    tasksViewRefetch.current?.()
  })

  useEffect(() => {
    if (calendars.length > 0) setVisibleCalendarIds(new Set(calendars.map((c) => c.id)))
  }, [calendars])

  // Fetch contacts once for the Birthdays & Anniversaries virtual calendar.
  // Re-fetch after any contact mutation so the calendar stays fresh.
  const refreshBirthdayContacts = useCallback(() => {
    const hasBirthdayCal = calendars.some((c) => c.isVirtual && c.id === 'virtual-birthdays')
    if (hasBirthdayCal) {
      getAllContacts().then(setBirthdayContacts).catch(() => {})
    }
  }, [calendars])

  useEffect(() => { refreshBirthdayContacts() }, [refreshBirthdayContacts])

  const visibleCalendars = calendars.filter((c) => visibleCalendarIds.has(c.id))
  const taskCalendars    = calendars.filter((c) => c.supportsTasks)

  function handleToggleCalendar(id: string) {
    setVisibleCalendarIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleMiniCalendarNavigate(date: Date) {
    calendarRef.current?.navigateTo(date)
    setFocusedDate(date)
  }

  // ── Event handlers ──────────────────────────────────────────────────────────
  const handleSaveEvent = useCallback(async (body: CreateEventBody | UpdateEventBody, isNew: boolean) => {
    if (isNew) {
      const created = await createEvent(body as CreateEventBody)
      // Show it immediately — the refetch below reconciles once Davis has indexed it.
      calendarRef.current?.addOptimisticEvent(created)
      // Undo a create by deleting the just-created object.
      pushUndo({
        label: 'Event created',
        undo: () => deleteEvent(created.uid, created.url, created.etag, 'all'),
      })
    } else {
      const b = body as UpdateEventBody
      const prior = editSnapshotRef.current
      await updateEvent(b.uid, b)
      // Undo a simple edit by restoring the pre-edit field values (force-write, no etag).
      // Only for non-recurring, non-occurrence events — series edits have ambiguous inverses.
      if (prior && prior.uid === b.uid && !prior.isOccurrence && !b.editScope) {
        pushUndo({
          label: 'Event updated',
          undo: async () => {
            await updateEvent(prior.uid, {
              uid: prior.uid,
              eventUrl: prior.url,
              calendarUrl: prior.calendarUrl,
              title: prior.title,
              start: prior.start,
              end: prior.end,
              allDay: prior.allDay,
              description: prior.description,
              location: prior.location,
              rrule: prior.rrule,
              reminder: prior.reminder,
              etag: undefined,
            })
          },
        })
      }
    }
    calendarRef.current?.refetchEvents()
  }, [pushUndo])

  const handleDeleteEvent = useCallback(async (event: CalendarEvent, editScope?: 'all' | 'this' | 'following') => {
    const scope = editScope ?? (event.isOccurrence ? 'this' : 'all')
    await deleteEvent(event.uid, event.url, event.etag, scope, event.occurrenceStart)
    // Offer undo only for whole non-recurring deletes — re-creating the event reverses it.
    // Recurring-occurrence deletes mutate the master .ics (EXDATE), which has no clean inverse.
    if (scope === 'all' && !event.isOccurrence && !event.rrule) {
      pushUndo({
        label: 'Event deleted',
        undo: async () => {
          await createEvent({
            calendarUrl: event.calendarUrl,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            description: event.description,
            location: event.location,
            reminder: event.reminder,
          })
        },
      })
    }
    calendarRef.current?.refetchEvents()
  }, [pushUndo])

  const handleClickEvent = useCallback((event: CalendarEvent) => {
    lastFocusedEventRef.current = event  // implicit source for Ctrl/Cmd-C
    if (event.isOccurrence) {
      setEventModal({ mode: 'recurring-choice', event })
    } else {
      editSnapshotRef.current = event  // capture pre-edit state for undo
      setEventModal({ mode: 'edit', event })
    }
  }, [])

  // ── Copy / paste ─────────────────────────────────────────────────────────────
  const handleCopyEvent = useCallback(() => {
    const src = lastFocusedEventRef.current
    if (src) eventClipboardRef.current = src
  }, [])

  // Paste a copied event onto the focused date, keeping its original time-of-day and duration.
  const handlePasteEvent = useCallback(async () => {
    const src = eventClipboardRef.current
    if (!src) return
    const origStart = new Date(src.start)
    const durationMs = new Date(src.end).getTime() - origStart.getTime()
    const newStart = new Date(focusedDate)
    if (!src.allDay) {
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0)
    } else {
      newStart.setHours(0, 0, 0, 0)
    }
    const newEnd = new Date(newStart.getTime() + (durationMs > 0 ? durationMs : 3600000))
    const body: CreateEventBody = {
      calendarUrl: src.calendarUrl,
      title: src.title,
      start: src.allDay ? newStart.toISOString().slice(0, 10) : newStart.toISOString(),
      end: src.allDay ? newEnd.toISOString().slice(0, 10) : newEnd.toISOString(),
      allDay: src.allDay,
      timeZone: src.allDay ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone,
      description: src.description,
      location: src.location,
      reminder: src.reminder,
    }
    const created = await createEvent(body)
    calendarRef.current?.addOptimisticEvent(created)
    calendarRef.current?.refetchEvents()
    pushUndo({ label: 'Event pasted', undo: () => deleteEvent(created.uid, created.url, created.etag, 'all') })
  }, [focusedDate, pushUndo])

  // Duplicate: open a fresh create modal pre-filled from an existing event.
  const handleDuplicateEvent = useCallback((event: CalendarEvent) => {
    const start = new Date(event.start)
    const end = new Date(event.end)
    setEventModal({
      mode: 'create',
      start,
      end,
      allDay: event.allDay,
      prefill: {
        title: `${event.title} (copy)`,
        description: event.description,
        location: event.location,
        rrule: event.rrule,
        reminder: event.reminder,
        attendees: event.attendees,
        calendarUrl: event.calendarUrl,
      },
    })
  }, [])

  const handleColorChange = useCallback((_cal: CalendarInfo, _color: string) => {
    refetchCalendars()
    calendarRef.current?.refetchEvents()
  }, [refetchCalendars])

  // Update the failed-subscription set only when it actually changes, so we don't
  // re-render (and re-run loadEvents) on every identical report.
  const handleSubscriptionErrors = useCallback((failedIds: string[]) => {
    setFailedSubscriptionIds((prev) => {
      if (prev.size === failedIds.length && failedIds.every((id) => prev.has(id))) return prev
      return new Set(failedIds)
    })
  }, [])

  // ── Task handlers ───────────────────────────────────────────────────────────
  const handleSaveTask = useCallback(async (body: CreateTaskBody | UpdateTaskBody, isNew: boolean) => {
    if (isNew) await createTask(body as CreateTaskBody)
    else { const b = body as UpdateTaskBody; await updateTask(b.uid, b) }
    tasksViewRefetch.current?.()
  }, [])

  const handleDeleteTask = useCallback(async (task: CalendarTask) => {
    await deleteTask(task.uid, task.url, task.etag)
    tasksViewRefetch.current?.()
  }, [])

  // ── Contact handlers ────────────────────────────────────────────────────────
  const handleSaveContact = useCallback(async (body: CreateContactBody | UpdateContactBody, isNew: boolean) => {
    if (isNew) await createContact(body as CreateContactBody)
    else { const b = body as UpdateContactBody; await updateContact(b.uid, b) }
    contactsRefetch.current?.()
    refreshBirthdayContacts()
  }, [refreshBirthdayContacts])

  const handleDeleteContact = useCallback(async (contact: Contact) => {
    await deleteContact(contact.uid, contact.url, contact.etag)
    contactsRefetch.current?.()
    refreshBirthdayContacts()
  }, [refreshBirthdayContacts])

  const handleDeleteSubscription = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to remove this calendar subscription?')) return
    await deleteSubscription(id)
    refetchCalendars()
  }, [refetchCalendars])

  // ── Create actions (shared by sidebar buttons and the "c" shortcut) ──────────
  const handleCreateEvent = useCallback(() => {
    const now = new Date()
    setEventModal({ mode: 'create', start: now, end: new Date(now.getTime() + 3600000), allDay: false })
  }, [])
  const handleCreateTask = useCallback(() => setTaskModal({ mode: 'create' }), [])
  const handleCreateContact = useCallback(
    () => setContactModal({ mode: 'create', defaultAddressBookUrl: addressBooks[0]?.url }),
    [addressBooks]
  )

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  // "Create" is context-aware: it opens the modal matching the active tab.
  const anyOverlayOpen =
    eventModal.mode !== 'closed' || taskModal.mode !== 'closed' ||
    contactModal.mode !== 'closed' || subscriptionModalOpen || helpOpen || shortcutsHelpOpen

  const handleShortcutCreate = useCallback(() => {
    if (anyOverlayOpen) return
    if (activeTab === 'tasks') handleCreateTask()
    else if (activeTab === 'contacts') handleCreateContact()
    else handleCreateEvent()
  }, [anyOverlayOpen, activeTab, handleCreateTask, handleCreateContact, handleCreateEvent])

  const handleEscape = useCallback(() => {
    if (shortcutsHelpOpen) setShortcutsHelpOpen(false)
    else if (helpOpen) setHelpOpen(false)
    else if (subscriptionModalOpen) setSubscriptionModalOpen(false)
    else if (eventModal.mode !== 'closed') setEventModal({ mode: 'closed' })
    else if (taskModal.mode !== 'closed') setTaskModal({ mode: 'closed' })
    else if (contactModal.mode !== 'closed') setContactModal({ mode: 'closed' })
  }, [shortcutsHelpOpen, helpOpen, subscriptionModalOpen, eventModal.mode, taskModal.mode, contactModal.mode])

  useKeyboardShortcuts({
    onCreate: handleShortcutCreate,
    onToday: () => calendarRef.current?.gotoToday(),
    onPrev: () => calendarRef.current?.gotoPrev(),
    onNext: () => calendarRef.current?.gotoNext(),
    onViewDay: () => calendarRef.current?.changeView('timeGridDay'),
    onViewWeek: () => calendarRef.current?.changeView('timeGridWeek'),
    onViewMonth: () => calendarRef.current?.changeView('dayGridMonth'),
    onViewAgenda: () => calendarRef.current?.changeView('listMonth'),
    onFocusSearch: () => { if (activeTab === 'calendar') calendarRef.current?.focusSearch() },
    onShowHelp: () => { if (!anyOverlayOpen) setShortcutsHelpOpen(true) },
    onEscape: handleEscape,
    onUndo: runUndo,
    onCopy: () => { if (activeTab === 'calendar') handleCopyEvent() },
    onPaste: () => { if (activeTab === 'calendar') handlePasteEvent() },
    // View-navigation keys (d/w/m/a, p/k/n/j) only apply on the calendar tab and when
    // no overlay is open. The always-on keys (c, t, /, ?, Esc) carry their own guards.
  }, activeTab === 'calendar' && !anyOverlayOpen)


  if (calendarsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <Layout
        sidebar={
          <Sidebar
            user={user}
            calendars={calendars}
            addressBooks={addressBooks}
            visibleCalendarIds={visibleCalendarIds}
            failedSubscriptionIds={failedSubscriptionIds}
            focusedDate={focusedDate}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onToggleCalendar={handleToggleCalendar}
            onNavigate={handleMiniCalendarNavigate}
            onCreateEvent={handleCreateEvent}
            onCreateTask={handleCreateTask}
            onCreateContact={handleCreateContact}
            onColorChange={handleColorChange}
            onAddSubscription={() => setSubscriptionModalOpen(true)}
            onDeleteSubscription={handleDeleteSubscription}
            onHelp={() => setHelpOpen(true)}
            onLogout={onLogout}
          />

        }
      >
        {activeTab === 'calendar' && (
          <CalendarView
            visibleCalendars={visibleCalendars}
            birthdayContacts={birthdayContacts}
            onClickSlot={(start, end, allDay) => setEventModal({ mode: 'create', start, end, allDay })}
            onClickEvent={handleClickEvent}
            onClickTask={(task) => setTaskModal({ mode: 'edit', task })}
            onDatesChange={setFocusedDate}
            onPushUndo={(label, undo) => pushUndo({ label, undo })}
            onSubscriptionErrors={handleSubscriptionErrors}
            calendarRef={calendarRef}
          />
        )}
        {activeTab === 'tasks' && (
          <TasksView
            visibleCalendars={visibleCalendars}
            onClickTask={(task) => setTaskModal({ mode: 'edit', task })}
            onCreateTask={() => setTaskModal({ mode: 'create' })}
            refetchRef={tasksViewRefetch}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsView
            onClickContact={(contact) => setContactModal({ mode: 'edit', contact })}
            onCreateContact={(url) => setContactModal({ mode: 'create', defaultAddressBookUrl: url })}
            onAddressBooksLoaded={setAddressBooks}
            refetchRef={contactsRefetch}
          />
        )}
      </Layout>

      {/* Recurring event scope picker */}
      {eventModal.mode === 'recurring-choice' && (
        <RecurrenceDialog
          action="edit"
          onSelect={(scope) => setEventModal({ mode: 'edit', event: eventModal.event, editScope: scope })}
          onClose={() => setEventModal({ mode: 'closed' })}
        />
      )}

      {/* Event modals */}
      {eventModal.mode === 'create' && (
        <EventModal event={null} defaultStart={eventModal.start} defaultEnd={eventModal.end}
          defaultAllDay={eventModal.allDay} prefill={eventModal.prefill}
          calendars={calendars.filter((c) => c.supportsEvents)}
          onSave={handleSaveEvent} onClose={() => setEventModal({ mode: 'closed' })} />
      )}
      {eventModal.mode === 'edit' && (
        <EventModal event={eventModal.event} editScope={eventModal.editScope}
          calendars={calendars.filter((c) => c.supportsEvents)}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent} onDuplicate={handleDuplicateEvent}
          onCopy={(ev) => { eventClipboardRef.current = ev }}
          onClose={() => setEventModal({ mode: 'closed' })} />
      )}

      {/* Task modals */}
      {taskModal.mode === 'create' && (
        <TaskModal task={null} calendars={taskCalendars} defaultCalendarUrl={taskCalendars[0]?.url}
          onSave={handleSaveTask} onClose={() => setTaskModal({ mode: 'closed' })} />
      )}
      {taskModal.mode === 'edit' && (
        <TaskModal task={taskModal.task} calendars={taskCalendars}
          onSave={handleSaveTask} onDelete={handleDeleteTask} onClose={() => setTaskModal({ mode: 'closed' })} />
      )}

      {/* Contact modals */}
      {contactModal.mode === 'create' && (
        <ContactModal contact={null} addressBooks={addressBooks}
          defaultAddressBookUrl={contactModal.defaultAddressBookUrl}
          onSave={handleSaveContact} onClose={() => setContactModal({ mode: 'closed' })} />
      )}
      {contactModal.mode === 'edit' && (
        <ContactModal contact={contactModal.contact} addressBooks={addressBooks}
          onSave={handleSaveContact} onDelete={handleDeleteContact} onClose={() => setContactModal({ mode: 'closed' })} />
      )}

      {/* DAVx5 setup guide */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Keyboard shortcuts overlay */}
      {shortcutsHelpOpen && <ShortcutsHelp onClose={() => setShortcutsHelpOpen(false)} />}

      {/* Undo toast */}
      {undoToast && <UndoToast label={undoToast.label} onUndo={runUndo} onDismiss={dismissUndo} />}

      {/* Subscription modal */}
      {subscriptionModalOpen && (
        <SubscriptionModal onSave={refetchCalendars} onClose={() => setSubscriptionModalOpen(false)} />
      )}
    </>

  )
}
