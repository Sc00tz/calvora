// SPDX-License-Identifier: GPL-3.0-or-later
interface Props {
  action: 'edit' | 'delete'
  onSelect: (scope: 'this' | 'following' | 'all') => void
  onClose: () => void
}

export default function RecurrenceDialog({ action, onSelect, onClose }: Props) {
  const verb = action === 'edit' ? 'edit' : 'delete'
  const Verb = action === 'edit' ? 'Edit' : 'Delete'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            {Verb} recurring event
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <p className="px-6 pt-4 pb-2 text-sm text-gray-500">
          Which events do you want to {verb}?
        </p>

        <div className="px-6 pb-5 flex flex-col gap-2">
          <button
            onClick={() => onSelect('this')}
            className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-800">This event</p>
            <p className="text-xs text-gray-400 mt-0.5">Only this occurrence</p>
          </button>

          <button
            onClick={() => onSelect('following')}
            className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-800">This and following events</p>
            <p className="text-xs text-gray-400 mt-0.5">This and all future occurrences</p>
          </button>

          <button
            onClick={() => onSelect('all')}
            className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-800">All events</p>
            <p className="text-xs text-gray-400 mt-0.5">Every occurrence in the series</p>
          </button>
        </div>
      </div>
    </div>
  )
}
