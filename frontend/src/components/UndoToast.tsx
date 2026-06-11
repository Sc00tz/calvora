// SPDX-License-Identifier: GPL-3.0-or-later
interface Props {
  label: string
  onUndo: () => void
  onDismiss: () => void
}

export default function UndoToast({ label, onUndo, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] no-print">
      <div className="flex items-center gap-4 bg-gray-900 text-white rounded-xl shadow-lg px-4 py-2.5 text-sm">
        <span>{label}</span>
        <button
          onClick={onUndo}
          className="font-semibold text-blue-300 hover:text-blue-200 transition-colors"
        >
          Undo
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-white transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
