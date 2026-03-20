// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useMemo, useRef } from 'react'
import { getAddressBooks, getContacts, exportContacts, importContacts, exportSingleContact, updateContact } from '../api/client'
import type { Contact, AddressBook, UpdateContactBody } from '../types/calendar'

// Google-style avatar colour palette — deterministic per name
const AVATAR_COLORS = ['#4285f4','#ea4335','#fbbc04','#34a853','#ff6d00','#46bdc6','#7b1fa2','#c62828','#00695c','#1565c0']
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(contact: Contact) {
  if (contact.firstName && contact.lastName) return (contact.firstName[0] + contact.lastName[0]).toUpperCase()
  if (contact.firstName) return contact.firstName[0].toUpperCase()
  if (contact.lastName)  return contact.lastName[0].toUpperCase()
  return contact.fullName.trim()[0]?.toUpperCase() ?? '?'
}

interface Props {
  onClickContact: (contact: Contact) => void
  onCreateContact: (defaultAddressBookUrl?: string) => void
  // Expose addressBooks + refetch to parent so CalendarApp can use them
  onAddressBooksLoaded: (books: AddressBook[]) => void
  refetchRef?: React.MutableRefObject<(() => void) | null>
}

export default function ContactsView({ onClickContact, onCreateContact, onAddressBooksLoaded, refetchRef }: Props) {
  const [addressBooks, setAddressBooks] = useState<AddressBook[]>([])
  const [contacts, setContacts]         = useState<Contact[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [selectedBook, setSelectedBook] = useState<string>('all')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const books = await getAddressBooks()
      setAddressBooks(books)
      onAddressBooksLoaded(books)
      if (books.length === 0) { setContacts([]); return }

      const results = await Promise.all(books.map(b => getContacts(b.url)))
      setContacts(results.flat())
    } catch (err) {
      console.error('Failed to load contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (refetchRef) refetchRef.current = load
    return () => { if (refetchRef) refetchRef.current = null }
  }, [refetchRef])

  // Filter + search (client-side)
  const filtered = useMemo(() => {
    let list = contacts
    if (selectedBook !== 'all') list = list.filter(c => c.addressBookUrl === selectedBook)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.email?.some(e => e.value.toLowerCase().includes(q)) ||
        c.phone?.some(p => p.value.toLowerCase().includes(q)) ||
        c.org?.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [contacts, search, selectedBook])

  // Starred (favorites) — sorted separately
  const favorites = useMemo(() => filtered.filter(c => c.starred), [filtered])

  // Alphabetical groups (non-starred only when there are favorites, otherwise all)
  const groups = useMemo(() => {
    const list = favorites.length > 0 ? filtered.filter(c => !c.starred) : filtered
    const map = new Map<string, Contact[]>()
    for (const c of list) {
      const key = c.fullName[0]?.toUpperCase() ?? '#'
      const letter = /[A-Z]/.test(key) ? key : '#'
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(c)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered, favorites])

  const defaultBook = addressBooks.find(b => b.url === selectedBook) ?? addressBooks[0]
  const exportBook  = selectedBook !== 'all'
    ? addressBooks.find(b => b.url === selectedBook)
    : addressBooks[0]

  async function handleExport() {
    if (!exportBook) return
    try {
      const blob = await exportContacts(exportBook.url)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportBook.displayName.replace(/\s+/g, '_')}.vcf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !exportBook) return
    e.target.value = ''
    setImportStatus('Importing…')
    try {
      const vcfData = await file.text()
      const result = await importContacts(exportBook.url, vcfData)
      setImportStatus(`Imported ${result.imported} contact${result.imported !== 1 ? 's' : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`)
      await load()
    } catch (err) {
      setImportStatus('Import failed')
    }
    setTimeout(() => setImportStatus(null), 4000)
  }

  async function handleToggleStar(contact: Contact) {
    const newStarred = !contact.starred
    // Optimistic update
    setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, starred: newStarred } : c))
    try {
      const body: UpdateContactBody = {
        uid: contact.uid,
        contactUrl: contact.url,
        addressBookUrl: contact.addressBookUrl,
        fullName: contact.fullName,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        org: contact.org,
        title: contact.title,
        notes: contact.notes,
        photo: contact.photo,
        birthday: contact.birthday,
        anniversary: contact.anniversary,
        categories: contact.categories,
        starred: newStarred || undefined,
        etag: contact.etag,
      }
      await updateContact(contact.uid, body)
    } catch (err) {
      console.error('Failed to update star:', err)
      setContacts(prev => prev.map(c => c.uid === contact.uid ? { ...c, starred: contact.starred } : c))
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Address book filter */}
        {addressBooks.length > 1 && (
          <select value={selectedBook} onChange={e => setSelectedBook(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="all">All contacts</option>
            {addressBooks.map(b => <option key={b.id} value={b.url}>{b.displayName}</option>)}
          </select>
        )}

        {/* Contact count */}
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
        </span>

        {/* Import/Export */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input ref={importInputRef} type="file" accept=".vcf,text/vcard" className="hidden" onChange={handleImportFile} />
          <button
            onClick={() => importInputRef.current?.click()}
            title="Import vCard (.vcf)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import
          </button>
          <button
            onClick={handleExport}
            title="Export contacts as .vcf"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5 0l4.5-4.5M12 21V7.5" />
            </svg>
            Export
          </button>
        </div>
        {importStatus && (
          <span className="text-xs text-blue-600 whitespace-nowrap">{importStatus}</span>
        )}
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">{search ? 'No contacts match your search' : 'No contacts yet'}</p>
            {!search && (
              <button onClick={() => onCreateContact(defaultBook?.url)}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                Create your first contact
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-2">
            {/* Favorites section */}
            {favorites.length > 0 && (
              <div>
                <div className="sticky top-0 bg-white z-10 py-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Favorites</span>
                </div>
                {favorites.map(contact => (
                  <ContactRow key={contact.uid} contact={contact}
                    onClick={() => onClickContact(contact)}
                    onToggleStar={() => handleToggleStar(contact)}
                    onExport={async () => {
                      try {
                        const blob = await exportSingleContact(contact.url, contact.fullName)
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url
                        a.download = `${contact.fullName.replace(/\s+/g, '_')}.vcf`
                        a.click(); URL.revokeObjectURL(url)
                      } catch (err) { console.error('Export failed:', err) }
                    }}
                  />
                ))}
              </div>
            )}

            {/* Alphabetical groups */}
            {groups.map(([letter, groupContacts]) => (
              <div key={letter}>
                <div className="sticky top-0 bg-white z-10 py-1.5">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{letter}</span>
                </div>
                {groupContacts.map(contact => (
                  <ContactRow
                    key={contact.uid}
                    contact={contact}
                    onClick={() => onClickContact(contact)}
                    onToggleStar={() => handleToggleStar(contact)}
                    onExport={async () => {
                      try {
                        const blob = await exportSingleContact(contact.url, contact.fullName)
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url
                        a.download = `${contact.fullName.replace(/\s+/g, '_')}.vcf`
                        a.click(); URL.revokeObjectURL(url)
                      } catch (err) { console.error('Export failed:', err) }
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Contact Row ──────────────────────────────────────────────────────────────

function ContactRow({ contact, onClick, onToggleStar, onExport }: { contact: Contact; onClick: () => void; onToggleStar: () => void; onExport: () => void }) {
  const color = avatarColor(contact.fullName)
  const abbr  = initials(contact)
  const secondary = [
    contact.org && contact.title ? `${contact.title} at ${contact.org}` : contact.org || contact.title,
    contact.email?.[0]?.value,
    contact.phone?.[0]?.value,
  ].filter(Boolean).slice(0, 2).join('  ·  ')

  return (
    <div
      className="w-full flex items-center gap-4 py-2.5 px-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      {/* Avatar */}
      {contact.photo ? (
        <img
          src={contact.photo}
          alt={contact.fullName}
          className="w-10 h-10 rounded-full flex-shrink-0 object-cover select-none"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold select-none"
          style={{ backgroundColor: color }}
        >
          {abbr}
        </div>
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{contact.fullName}</p>
        {secondary && <p className="text-xs text-gray-500 truncate mt-0.5">{secondary}</p>}
      </div>

      {/* Actions: star always visible when starred, others on hover */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleStar() }}
          title={contact.starred ? 'Remove from favorites' : 'Add to favorites'}
          className={`p-1 transition-colors ${contact.starred ? 'text-amber-400' : 'text-gray-200 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
        >
          {contact.starred ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExport() }}
          title="Export vCard"
          className="p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5 0l4.5-4.5M12 21V7.5" />
          </svg>
        </button>
        <svg className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}
