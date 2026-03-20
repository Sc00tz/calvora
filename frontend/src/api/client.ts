// SPDX-License-Identifier: GPL-3.0-or-later
import axios from 'axios'
import type { CalendarInfo, CalendarEvent, CreateEventBody, UpdateEventBody, User, CalendarTask, CreateTaskBody, UpdateTaskBody, AddressBook, Contact, CreateContactBody, UpdateContactBody } from '../types/calendar'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Auth
export const login = (username: string, password: string) =>
  api.post<User>('/auth/login', { username, password }).then((r) => r.data)

export const logout = () =>
  api.post('/auth/logout').then((r) => r.data)

export const getMe = () =>
  api.get<User>('/auth/me').then((r) => r.data)

// Calendars
export const getCalendars = () =>
  api.get<CalendarInfo[]>('/calendars').then((r) => r.data)

// Events
export const getEvents = (calendarUrl: string, start: string, end: string) =>
  api.get<CalendarEvent[]>('/events', { params: { calendarUrl, start, end } }).then((r) => r.data)

export const createEvent = (body: CreateEventBody) =>
  api.post<CalendarEvent>('/events', body).then((r) => r.data)

export const updateEvent = (uid: string, body: UpdateEventBody) =>
  api.put<void>(`/events/${uid}`, body).then((r) => r.data)

export const deleteEvent = (
  uid: string, eventUrl: string, etag?: string,
  editScope?: string, occurrenceStart?: string
) =>
  api.delete(`/events/${uid}`, { params: { eventUrl, etag, editScope, occurrenceStart } }).then((r) => r.data)

export const searchEvents = (q: string, calendarUrls: string[]) =>
  api.get<CalendarEvent[]>('/events/search', { params: { q, calendarUrl: calendarUrls } }).then((r) => r.data)

// Tasks
export const getTasks = (calendarUrl: string) =>
  api.get<CalendarTask[]>('/tasks', { params: { calendarUrl } }).then((r) => r.data)

export const createTask = (body: CreateTaskBody) =>
  api.post<CalendarTask>('/tasks', body).then((r) => r.data)

export const updateTask = (uid: string, body: UpdateTaskBody) =>
  api.put<void>(`/tasks/${uid}`, body).then((r) => r.data)

export const deleteTask = (uid: string, taskUrl: string, etag?: string) =>
  api.delete(`/tasks/${uid}`, { params: { taskUrl, etag } }).then((r) => r.data)

// Contacts
export const getAddressBooks = () =>
  api.get<AddressBook[]>('/contacts/address-books').then((r) => r.data)

export const getContacts = (addressBookUrl: string) =>
  api.get<Contact[]>('/contacts', { params: { addressBookUrl } }).then((r) => r.data)

export const getAllContacts = () =>
  api.get<Contact[]>('/contacts/all').then((r) => r.data)


export const createContact = (body: CreateContactBody) =>
  api.post<Contact>('/contacts', body).then((r) => r.data)

export const updateContact = (uid: string, body: UpdateContactBody) =>
  api.put<void>(`/contacts/${uid}`, body).then((r) => r.data)

export const deleteContact = (uid: string, contactUrl: string, etag?: string) =>
  api.delete(`/contacts/${uid}`, { params: { contactUrl, etag } }).then((r) => r.data)

export const exportSingleContact = (contactUrl: string, filename?: string) =>
  api.get<Blob>('/contacts/export-single', { params: { contactUrl, filename }, responseType: 'blob' }).then((r) => r.data)

export const exportContacts = (addressBookUrl: string) =>
  api.get<Blob>('/contacts/export', { params: { addressBookUrl }, responseType: 'blob' }).then((r) => r.data)

export const importContacts = (addressBookUrl: string, vcfData: string) =>
  api.post<{ imported: number; failed: number }>('/contacts/import', { addressBookUrl, vcfData }).then((r) => r.data)

// Subscriptions
export const getSubscriptions = () =>
  api.get<CalendarInfo[]>('/subscriptions').then((r) => r.data)

export const createSubscription = (body: { url: string; name: string; color: string }) =>
  api.post<CalendarInfo>('/subscriptions', body).then((r) => r.data)

export const deleteSubscription = (id: string) =>
  api.delete(`/subscriptions/${id}`).then((r) => r.data)

export const getExternalIcal = (url: string) =>
  api.get<string>('/subscriptions/proxy', { params: { url } }).then((r) => r.data)
