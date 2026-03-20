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
import { useNotifications } from '../hooks/useNotifications'
import { deleteSubscription, getAllContacts } from '../api/client'
import type { User, CalendarEvent, CalendarInfo, CreateEventBody, UpdateEventBody, CalendarTask, CreateTaskBody, UpdateTaskBody, Contact, AddressBook, CreateContactBody, UpdateContactBody } from '../types/calendar'


interface Props {
  user: User
  onLogout: () => void
}

type EventModalState =
  | { mode: 'closed' }
  | { mode: 'create'; start: Date; end: Date; allDay: boolean }
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

interface CalendarHandle {
  refetchEvents: () => void
  navigateTo: (date: Date) => void
}

export default function CalendarApp({ user, onLogout }: Props) {
  const { calendars, loading: calendarsLoading, refetch: refetchCalendars } = useCalendars()
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar')
  const [eventModal, setEventModal]     = useState<EventModalState>({ mode: 'closed' })
  const [taskModal, setTaskModal]       = useState<TaskModalState>({ mode: 'closed' })
  const [contactModal, setContactModal] = useState<ContactModalState>({ mode: 'closed' })
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set())
  const [helpOpen, setHelpOpen] = useState(false)
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)
  const [focusedDate, setFocusedDate] = useState(new Date())

  const [addressBooks, setAddressBooks] = useState<AddressBook[]>([])
  const [birthdayContacts, setBirthdayContacts] = useState<Contact[]>([])
  const calendarRef      = useRef<CalendarHandle | null>(null)
  const tasksViewRefetch = useRef<(() => void) | null>(null)
  const contactsRefetch  = useRef<(() => void) | null>(null)

  useNotifications(calendars, visibleCalendarIds)

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
    if (isNew) await createEvent(body as CreateEventBody)
    else { const b = body as UpdateEventBody; await updateEvent(b.uid, b) }
    calendarRef.current?.refetchEvents()
  }, [])

  const handleDeleteEvent = useCallback(async (event: CalendarEvent, editScope?: 'all' | 'this' | 'following') => {
    const scope = editScope ?? (event.isOccurrence ? 'this' : 'all')
    await deleteEvent(event.uid, event.url, event.etag, scope, event.occurrenceStart)
    calendarRef.current?.refetchEvents()
  }, [])

  const handleClickEvent = useCallback((event: CalendarEvent) => {
    if (event.isOccurrence) {
      setEventModal({ mode: 'recurring-choice', event })
    } else {
      setEventModal({ mode: 'edit', event })
    }
  }, [])

  const handleColorChange = useCallback((_cal: CalendarInfo, _color: string) => {
    refetchCalendars()
    calendarRef.current?.refetchEvents()
  }, [refetchCalendars])

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
            focusedDate={focusedDate}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onToggleCalendar={handleToggleCalendar}
            onNavigate={handleMiniCalendarNavigate}
            onCreateEvent={() => {
              const now = new Date()
              setEventModal({ mode: 'create', start: now, end: new Date(now.getTime() + 3600000), allDay: false })
            }}
            onCreateTask={() => setTaskModal({ mode: 'create' })}
            onCreateContact={() => setContactModal({ mode: 'create', defaultAddressBookUrl: addressBooks[0]?.url })}
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
          defaultAllDay={eventModal.allDay} calendars={calendars.filter((c) => c.supportsEvents)}
          onSave={handleSaveEvent} onClose={() => setEventModal({ mode: 'closed' })} />
      )}
      {eventModal.mode === 'edit' && (
        <EventModal event={eventModal.event} editScope={eventModal.editScope}
          calendars={calendars.filter((c) => c.supportsEvents)}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent} onClose={() => setEventModal({ mode: 'closed' })} />
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

      {/* Help modal */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Subscription modal */}
      {subscriptionModalOpen && (
        <SubscriptionModal onSave={refetchCalendars} onClose={() => setSubscriptionModalOpen(false)} />
      )}
    </>

  )
}
