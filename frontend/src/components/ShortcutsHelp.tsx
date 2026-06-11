// SPDX-License-Identifier: GPL-3.0-or-later
interface Props {
  onClose: () => void
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['c'], label: 'Create event' },
  { keys: ['t'], label: 'Go to today' },
  { keys: ['p', 'k'], label: 'Previous period' },
  { keys: ['n', 'j'], label: 'Next period' },
  { keys: ['d', '1'], label: 'Day view' },
  { keys: ['w', '2'], label: 'Week view' },
  { keys: ['m', '3'], label: 'Month view' },
  { keys: ['a', '4'], label: 'Agenda view' },
  { keys: ['/'], label: 'Search events' },
  { keys: ['?'], label: 'Show this help' },
  { keys: ['Esc'], label: 'Close dialog' },
]

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 text-xs font-mono font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded shadow-sm">
      {children}
    </kbd>
  )
}

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <ul className="px-6 py-4 space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs text-gray-400">or</span>}
                    <Key>{k}</Key>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
