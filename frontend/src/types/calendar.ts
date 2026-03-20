// SPDX-License-Identifier: GPL-3.0-or-later
export interface CalendarInfo {
  id: string
  url: string
  displayName: string
  color: string
  isShared: boolean
  canWrite: boolean
  supportsEvents: boolean
  supportsTasks: boolean
  isExternal?: boolean
  isVirtual?: boolean
}


export interface CalendarTask {
  uid: string
  url: string           // task object URL (.ics)
  calendarUrl: string   // calendar collection URL
  title: string
  description?: string
  due?: string          // ISO string
  completed?: string    // ISO string
  status: 'NEEDS-ACTION' | 'COMPLETED' | 'IN-PROCESS' | 'CANCELLED'
  priority?: number     // 1–9 (1=highest), 0/undefined = none
  etag?: string
}

export interface CreateTaskBody {
  calendarUrl: string
  title: string
  description?: string
  due?: string
  status?: 'NEEDS-ACTION' | 'COMPLETED' | 'IN-PROCESS' | 'CANCELLED'
  priority?: number
}

export interface UpdateTaskBody extends CreateTaskBody {
  uid: string
  taskUrl: string
  completed?: string
  etag?: string
}

export interface CalendarEvent {
  uid: string
  url: string           // event object URL (.ics)
  calendarUrl: string   // calendar collection URL
  title: string
  start: string
  end: string
  allDay: boolean
  description?: string
  location?: string
  rrule?: string
  reminder?: number     // minutes before; undefined = no reminder
  etag?: string
  // Recurring event occurrence fields (set by server-side expansion)
  isOccurrence?: boolean
  masterUid?: string
  occurrenceStart?: string  // original occurrence start ISO (used as RECURRENCE-ID)
  masterStart?: string      // master's first occurrence start (for "edit all" scope)
  masterEnd?: string
  masterAllDay?: boolean
}

export interface CreateEventBody {
  calendarUrl: string
  title: string
  start: string
  end: string
  allDay?: boolean
  description?: string
  location?: string
  rrule?: string
  reminder?: number
}

export interface UpdateEventBody extends CreateEventBody {
  uid: string
  eventUrl: string      // event object URL for the PUT request
  etag?: string
  editScope?: 'all' | 'this' | 'following'
  occurrenceStart?: string
  masterUid?: string
}

export interface User {
  username: string
}

export interface AddressBook {
  id: string
  url: string
  displayName: string
}

export interface Contact {
  uid: string
  url: string
  addressBookUrl: string
  fullName: string
  firstName?: string
  lastName?: string
  email?: { value: string; type?: string }[]
  phone?: { value: string; type?: string }[]
  org?: string
  title?: string
  notes?: string
  photo?: string        // data URI (data:image/jpeg;base64,...)
  birthday?: string     // YYYY-MM-DD
  anniversary?: string  // YYYY-MM-DD
  categories?: string[] // tags
  starred?: boolean     // X-ANDROID-STARRED — favorite on Android
  etag?: string
}

export interface CreateContactBody {
  addressBookUrl: string
  fullName: string
  firstName?: string
  lastName?: string
  email?: { value: string; type?: string }[]
  phone?: { value: string; type?: string }[]
  org?: string
  title?: string
  notes?: string
  photo?: string        // data URI
  birthday?: string     // YYYY-MM-DD
  anniversary?: string  // YYYY-MM-DD
  categories?: string[]
  starred?: boolean
}

export interface UpdateContactBody extends CreateContactBody {
  uid: string
  contactUrl: string
  etag?: string
}
