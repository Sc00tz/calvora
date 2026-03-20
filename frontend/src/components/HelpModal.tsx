// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react'
import axios from 'axios'

interface Props {
  onClose: () => void
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="flex items-center gap-2 bg-gray-900 text-green-400 font-mono text-sm rounded-lg px-4 py-3 mt-2">
      <span className="flex-1 break-all">{url}</span>
      <button
        onClick={copy}
        title="Copy URL"
        className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
        <div className="text-sm text-gray-600 space-y-2">{children}</div>
      </div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-gray-100 text-gray-700 text-xs font-medium rounded px-1.5 py-0.5 font-mono">
      {children}
    </span>
  )
}

export default function HelpModal({ onClose }: Props) {
  const [serverUrl, setServerUrl] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'macos'>('android')

  useEffect(() => {
    axios.get<{ davx5ServerUrl: string }>('/api/help/config')
      .then((r) => setServerUrl(r.data.davx5ServerUrl))
      .catch(() => {})
  }, [])

  const displayUrl = serverUrl || 'http://YOUR_SERVER_IP:8091'
  const isPlaceholder = !serverUrl || serverUrl.includes('YOUR_SERVER_IP')

  const tabs = [
    { id: 'android', label: 'Android' },
    { id: 'ios', label: 'iOS (iPhone/iPad)' },
    { id: 'macos', label: 'macOS' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-0 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Sync with your devices</h2>
              <p className="text-xs text-gray-400 mt-0.5">Setup instructions for calendars, tasks &amp; contacts</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {isPlaceholder && (
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Set <Pill>DAVX5_SERVER_URL</Pill> in your <Pill>docker-compose.yml</Pill> to your server's real IP or hostname so this guide shows the correct URL automatically.
              </span>
            </div>
          )}

          {activeTab === 'android' && (
            <>
              <Step n={1} title="Install F-Droid">
                <p>F-Droid is a free app store — DAVx⁵ is free there (it costs money on Google Play).</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Go to <span className="font-medium text-blue-600">f-droid.org</span> on your phone</li>
                  <li>Download and install the F-Droid APK</li>
                </ol>
              </Step>
              <Step n={2} title="Install DAVx⁵">
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Search F-Droid for <span className="font-medium">DAVx5</span></li>
                  <li>Install <span className="font-medium">DAVx⁵ – CalDAV/CardDAV Sync</span></li>
                </ol>
              </Step>
              <Step n={3} title="Add Account">
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open DAVx⁵ and tap the <span className="font-medium">+</span> button</li>
                  <li>Choose <span className="font-medium">"Login with URL and user name"</span></li>
                </ol>
                <div className="mt-3 space-y-2 pl-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Base URL</p>
                  <CopyableUrl url={displayUrl} />
                </div>
              </Step>
              <Step n={4} title="Select Resources">
                <p>After logging in, check the boxes for the calendars and address books you want to sync.</p>
              </Step>
            </>
          )}

          {activeTab === 'ios' && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 mb-2">
                iOS supports CalDAV and CardDAV natively. No extra apps required.
              </div>
              <Step n={1} title="Add Calendar Account">
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Go to <span className="font-medium">Settings → Apps → Calendar</span></li>
                  <li>Tap <span className="font-medium">Calendar Accounts → Add Account</span></li>
                  <li>Tap <span className="font-medium">Other → Add CalDAV Account</span></li>
                </ol>
              </Step>
              <Step n={2} title="Enter External Server Details">
                <div className="mt-3 space-y-2 pl-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Server</p>
                  <CopyableUrl url={displayUrl} />
                  <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-gray-500 uppercase font-semibold">
                    <div>User Name</div>
                    <div>Password</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                    <div className="bg-gray-50 rounded px-2 py-1">Your username</div>
                    <div className="bg-gray-50 rounded px-2 py-1">Your password</div>
                  </div>
                </div>
              </Step>
              <Step n={3} title="Sync Contacts (Optional)">
                <p>Repeat the steps above but go to <span className="font-medium">Settings → Apps → Contacts</span> and select <span className="font-medium">Add CardDAV Account</span>.</p>
              </Step>
            </>
          )}

          {activeTab === 'macos' && (
            <>
              <Step n={1} title="Open Internet Accounts">
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Open <span className="font-medium">System Settings</span></li>
                  <li>Click <span className="font-medium">Internet Accounts</span> in the sidebar</li>
                  <li>Click <span className="font-medium">Add Account...</span> and then <span className="font-medium">Other...</span></li>
                </ol>
              </Step>
              <Step n={2} title="Add CalDAV Account">
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Select <span className="font-medium">CalDAV Account</span></li>
                  <li>Change Account Type to <span className="font-medium">Manual</span></li>
                  <li>Enter your username, password, and the server address:</li>
                </ol>
                <div className="mt-3 pl-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Server Address</p>
                  <CopyableUrl url={displayUrl} />
                </div>
              </Step>
              <Step n={3} title="Add CardDAV Account">
                <p>Repeat exactly as above, but select <span className="font-medium">CardDAV Account</span> for your contacts.</p>
              </Step>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Need help? Check the{' '}
            <a
              href="https://sabre.io/dav/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              SabreDAV Docs
            </a>
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

