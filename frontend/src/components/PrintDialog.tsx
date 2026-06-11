// SPDX-License-Identifier: GPL-3.0-or-later
interface Props {
  onChoose: (mode: 'grid' | 'agenda') => void
  onClose: () => void
}

export default function PrintDialog({ onChoose, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Print calendar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-500">Choose a layout to print.</p>
          <button
            onClick={() => onChoose('grid')}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              <span className="block text-sm font-medium text-gray-800">Grid (current view)</span>
              <span className="block text-xs text-gray-500">Print the month/week/day layout as shown.</span>
            </span>
          </button>
          <button
            onClick={() => onChoose('agenda')}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>
              <span className="block text-sm font-medium text-gray-800">Agenda list</span>
              <span className="block text-xs text-gray-500">Print a compact, ink-friendly list of events.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
