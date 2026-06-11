// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect } from 'react'

export interface ShortcutHandlers {
  onCreate?: () => void
  onToday?: () => void
  onPrev?: () => void
  onNext?: () => void
  onViewDay?: () => void
  onViewWeek?: () => void
  onViewMonth?: () => void
  onViewAgenda?: () => void
  onFocusSearch?: () => void
  onShowHelp?: () => void
  onEscape?: () => void
  onUndo?: () => void
  onCopy?: () => void
  onPaste?: () => void
}

// Returns true if the event target is a field where the user is actively typing,
// so single-key shortcuts don't hijack normal text entry.
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

// Google-Calendar-style global keyboard shortcuts. `enabled` lets the caller suppress
// view-navigation keys (e.g. when not on the calendar tab) while still allowing Escape.
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape always works (close modal/overlay), even from inside a field.
      if (e.key === 'Escape') {
        handlers.onEscape?.()
        return
      }

      // Ctrl/Cmd-Z → undo the last action, but not while typing (let the field's
      // own text-undo handle it). Handled here, before the modifier-combo guard below.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (!isTypingTarget(e.target)) {
          handlers.onUndo?.()
          e.preventDefault()
        }
        return
      }

      // Ctrl/Cmd-C → copy the focused event, but only when not typing AND no text is
      // selected, so normal text copy is never hijacked.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        const hasTextSelection = !!window.getSelection()?.toString()
        if (!isTypingTarget(e.target) && !hasTextSelection) {
          handlers.onCopy?.()
        }
        return
      }

      // Ctrl/Cmd-V → paste a copied event at the focused date (not while typing).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        if (!isTypingTarget(e.target)) {
          handlers.onPaste?.()
        }
        return
      }

      // Never intercept while the user is typing or using a modifier combo
      // (those belong to the browser/OS — copy, paste, find, etc.).
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case '?':
          handlers.onShowHelp?.(); e.preventDefault(); break
        case '/':
          handlers.onFocusSearch?.(); e.preventDefault(); break
        case 'c':
          handlers.onCreate?.(); e.preventDefault(); break
        case 't':
          handlers.onToday?.(); e.preventDefault(); break
        case 'p': case 'k':
          if (enabled) { handlers.onPrev?.(); e.preventDefault() } break
        case 'n': case 'j':
          if (enabled) { handlers.onNext?.(); e.preventDefault() } break
        case 'd': case '1':
          if (enabled) { handlers.onViewDay?.(); e.preventDefault() } break
        case 'w': case '2':
          if (enabled) { handlers.onViewWeek?.(); e.preventDefault() } break
        case 'm': case '3':
          if (enabled) { handlers.onViewMonth?.(); e.preventDefault() } break
        case 'a': case '4':
          if (enabled) { handlers.onViewAgenda?.(); e.preventDefault() } break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handlers, enabled])
}
