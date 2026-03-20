// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef } from 'react'
import type { CalendarTask, CalendarInfo, CreateTaskBody, UpdateTaskBody } from '../types/calendar'

interface Props {
  task: CalendarTask | null
  calendars: CalendarInfo[]          // only task-capable calendars
  defaultCalendarUrl?: string
  onSave: (body: CreateTaskBody | UpdateTaskBody, isNew: boolean) => Promise<void>
  onDelete?: (task: CalendarTask) => Promise<void>
  onClose: () => void
}

const PRIORITY_OPTIONS = [
  { label: 'None', value: 0 },
  { label: 'High', value: 1 },
  { label: 'Medium', value: 5 },
  { label: 'Low', value: 9 },
]

export default function TaskModal({ task, calendars, defaultCalendarUrl, onSave, onDelete, onClose }: Props) {
  const isNew = task === null
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [due, setDue] = useState(task?.due ? toDatetimeLocal(task.due) : '')
  const [status, setStatus] = useState<CalendarTask['status']>(task?.status || 'NEEDS-ACTION')
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [calendarUrl, setCalendarUrl] = useState(
    task?.calendarUrl || defaultCalendarUrl || calendars[0]?.url || ''
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { firstInputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    try {
      const dueIso = due ? new Date(due).toISOString() : undefined
      if (isNew) {
        const body: CreateTaskBody = {
          calendarUrl,
          title: title.trim(),
          description: description.trim() || undefined,
          due: dueIso,
          status,
          priority: priority || undefined,
        }
        await onSave(body, true)
      } else {
        const completedIso = status === 'COMPLETED' && !task!.completed
          ? new Date().toISOString()
          : status !== 'COMPLETED' ? undefined
          : task!.completed
        const body: UpdateTaskBody = {
          uid: task!.uid,
          taskUrl: task!.url,
          calendarUrl: task!.calendarUrl,
          title: title.trim(),
          description: description.trim() || undefined,
          due: dueIso,
          status,
          priority: priority || undefined,
          completed: completedIso,
          etag: task!.etag,
        }
        await onSave(body, false)
      }
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task || !onDelete) return
    setDeleting(true)
    try {
      await onDelete(task)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete task')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'New task' : 'Edit task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
          {/* Title */}
          <input
            ref={firstInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Calendar (only shown for new tasks) */}
          {isNew && calendars.length > 1 && (
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: calendars.find((c) => c.url === calendarUrl)?.color || '#3788d8' }}
              />
              <select
                value={calendarUrl}
                onChange={(e) => setCalendarUrl(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.url}>{cal.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status + Priority row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CalendarTask['status'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="NEEDS-ACTION">To do</option>
                <option value="IN-PROCESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add notes..."
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {!isNew && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete task'}
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : isNew ? 'Add task' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
