// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useCallback, useRef } from 'react'

// One reversible action. `undo` issues the inverse CalDAV operation(s). CalDAV has no
// server-side undo, so every undoable mutation must supply how to reverse itself here.
export interface UndoAction {
  label: string                 // e.g. "Event deleted"
  undo: () => Promise<void>
}

const TOAST_TIMEOUT_MS = 8000   // how long the Undo toast stays offered

export interface UndoState {
  toast: { label: string } | null
  pushUndo: (action: UndoAction) => void
  runUndo: () => void
  dismiss: () => void
}

export function useUndo(onAfterUndo?: () => void): UndoState {
  const [toast, setToast] = useState<{ label: string } | null>(null)
  // Only the most recent action is offered (single-level undo, like GCal's snackbar).
  const pendingRef = useRef<UndoAction | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    pendingRef.current = null
    setToast(null)
  }, [])

  const pushUndo = useCallback((action: UndoAction) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    pendingRef.current = action
    setToast({ label: action.label })
    timerRef.current = setTimeout(() => {
      pendingRef.current = null
      setToast(null)
    }, TOAST_TIMEOUT_MS)
  }, [])

  const runUndo = useCallback(() => {
    const action = pendingRef.current
    if (!action || runningRef.current) return
    runningRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    pendingRef.current = null
    setToast(null)
    action.undo()
      .then(() => onAfterUndo?.())
      .catch((err) => console.error('Undo failed:', err))
      .finally(() => { runningRef.current = false })
  }, [onAfterUndo])

  return { toast, pushUndo, runUndo, dismiss }
}
