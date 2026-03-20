// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback, useRef, MutableRefObject } from 'react'
import { getTasks, updateTask } from '../api/client'
import type { CalendarInfo, CalendarTask, UpdateTaskBody } from '../types/calendar'

interface Props {
  visibleCalendars: CalendarInfo[]   // only the ones the user has toggled on
  onClickTask: (task: CalendarTask) => void
  onCreateTask: () => void
  refetchRef?: MutableRefObject<(() => void) | null>
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'High', 2: 'High', 3: 'High', 4: 'Medium', 5: 'Medium', 6: 'Medium', 7: 'Low', 8: 'Low', 9: 'Low' }
const PRIORITY_COLOR: Record<string, string> = { High: 'text-red-500', Medium: 'text-yellow-500', Low: 'text-blue-400' }

export default function TasksView({ visibleCalendars, onClickTask, onCreateTask, refetchRef }: Props) {
  const taskCalendars = visibleCalendars.filter((c) => c.supportsTasks)
  const [tasksByCalendar, setTasksByCalendar] = useState<Map<string, CalendarTask[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const taskCalendarsRef = useRef(taskCalendars)
  taskCalendarsRef.current = taskCalendars

  const loadTasks = useCallback(async (calendars: CalendarInfo[]) => {
    if (calendars.length === 0) { setTasksByCalendar(new Map()); return }
    setLoading(true)
    try {
      const results = await Promise.all(
        calendars.map(async (cal) => {
          const tasks = await getTasks(cal.url)
          return { calUrl: cal.url, tasks }
        })
      )
      const map = new Map<string, CalendarTask[]>()
      for (const { calUrl, tasks } of results) map.set(calUrl, tasks)
      setTasksByCalendar(map)
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks(taskCalendars)
  }, [visibleCalendars]) // re-fetch when visible calendars change

  // Expose a refetch function to the parent so saves/deletes can trigger a reload
  useEffect(() => {
    if (refetchRef) {
      refetchRef.current = () => loadTasks(taskCalendarsRef.current)
    }
    return () => { if (refetchRef) refetchRef.current = null }
  }, [refetchRef, loadTasks])

  async function handleToggleComplete(task: CalendarTask, e: React.MouseEvent) {
    e.stopPropagation()
    const newStatus = task.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED'
    const body: UpdateTaskBody = {
      uid: task.uid,
      taskUrl: task.url,
      calendarUrl: task.calendarUrl,
      title: task.title,
      description: task.description,
      due: task.due,
      status: newStatus,
      priority: task.priority,
      completed: newStatus === 'COMPLETED' ? new Date().toISOString() : undefined,
      etag: task.etag,
    }
    // Optimistic update
    setTasksByCalendar((prev) => {
      const next = new Map(prev)
      const list = next.get(task.calendarUrl) ?? []
      next.set(task.calendarUrl, list.map((t) => t.uid === task.uid ? { ...t, status: newStatus } : t))
      return next
    })
    try {
      await updateTask(task.uid, body)
    } catch (err) {
      console.error('Failed to toggle task:', err)
      loadTasks(taskCalendars) // revert on failure
    }
  }

  if (taskCalendars.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No task-capable calendars visible. Enable a calendar that supports tasks.
      </div>
    )
  }

  const allTasks = taskCalendars.flatMap((cal) => (tasksByCalendar.get(cal.url) ?? []).map((t) => ({ task: t, cal })))
  const pending = allTasks.filter(({ task }) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
  const completed = allTasks.filter(({ task }) => task.status === 'COMPLETED' || task.status === 'CANCELLED')

  pending.sort((a, b) => {
    // Sort by priority (lower number = higher priority), then by due date
    const pa = a.task.priority || 10
    const pb = b.task.priority || 10
    if (pa !== pb) return pa - pb
    if (a.task.due && b.task.due) return new Date(a.task.due).getTime() - new Date(b.task.due).getTime()
    if (a.task.due) return -1
    if (b.task.due) return 1
    return 0
  })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
          <button
            onClick={onCreateTask}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add task
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && pending.length === 0 && completed.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">No tasks yet. Add one to get started.</p>
        )}

        {/* Pending tasks grouped by calendar */}
        {!loading && taskCalendars.map((cal) => {
          const calTasks = pending.filter(({ cal: c }) => c.url === cal.url)
          if (calTasks.length === 0) return null
          return (
            <div key={cal.url} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{cal.displayName}</span>
              </div>
              <ul className="space-y-1">
                {calTasks.map(({ task }) => (
                  <TaskRow
                    key={task.uid}
                    task={task}
                    calColor={cal.color}
                    onClick={() => onClickTask(task)}
                    onToggle={(e) => handleToggleComplete(task, e)}
                  />
                ))}
              </ul>
            </div>
          )
        })}

        {/* Completed section */}
        {!loading && completed.length > 0 && (
          <CompletedSection items={completed} onClickTask={onClickTask} onToggle={handleToggleComplete} />
        )}
      </div>
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, calColor, onClick, onToggle }: {
  task: CalendarTask
  calColor: string
  onClick: () => void
  onToggle: (e: React.MouseEvent) => void
}) {
  const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
  const priorityLabel = task.priority ? PRIORITY_LABEL[task.priority] : undefined
  const priorityColor = priorityLabel ? PRIORITY_COLOR[priorityLabel] : undefined
  const isOverdue = task.due && !isDone && new Date(task.due) < new Date()

  return (
    <li
      onClick={onClick}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
        style={{ borderColor: isDone ? calColor : calColor, backgroundColor: isDone ? calColor : 'transparent' }}
        title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {isDone && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.due && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {formatDue(task.due)}
            </span>
          )}
          {priorityLabel && (
            <span className={`text-xs font-medium ${priorityColor}`}>{priorityLabel}</span>
          )}
          {task.status === 'IN-PROCESS' && (
            <span className="text-xs text-blue-500 font-medium">In progress</span>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Completed Section ────────────────────────────────────────────────────────

function CompletedSection({ items, onClickTask, onToggle }: {
  items: { task: CalendarTask; cal: CalendarInfo }[]
  onClickTask: (t: CalendarTask) => void
  onToggle: (t: CalendarTask, e: React.MouseEvent) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors mb-2"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Completed ({items.length})
      </button>
      {open && (
        <ul className="space-y-1">
          {items.map(({ task, cal }) => (
            <TaskRow
              key={task.uid}
              task={task}
              calColor={cal.color}
              onClick={() => onClickTask(task)}
              onToggle={(e) => onToggle(task, e)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDue(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86400000)
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (dDay.getTime() === today.getTime()) return 'Today'
  if (dDay.getTime() === tomorrow.getTime()) return 'Tomorrow'

  const diff = Math.round((dDay.getTime() - today.getTime()) / 86400000)
  if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
