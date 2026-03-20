// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useRef } from 'react'
import type { Contact, AddressBook, CreateContactBody, UpdateContactBody } from '../types/calendar'
import { exportSingleContact } from '../api/client'

interface Props {
  contact: Contact | null
  addressBooks: AddressBook[]
  defaultAddressBookUrl?: string
  onSave: (body: CreateContactBody | UpdateContactBody, isNew: boolean) => Promise<void>
  onDelete?: (contact: Contact) => Promise<void>
  onClose: () => void
}

const EMAIL_TYPES = ['home', 'work', 'other']
const PHONE_TYPES = ['mobile', 'home', 'work', 'other']

type EmailEntry = { value: string; type: string }
type PhoneEntry = { value: string; type: string }

export default function ContactModal({ contact, addressBooks, defaultAddressBookUrl, onSave, onDelete, onClose }: Props) {
  const isNew = contact === null
  const firstRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(contact?.firstName || '')
  const [lastName, setLastName]   = useState(contact?.lastName  || '')
  const [org, setOrg]             = useState(contact?.org   || '')
  const [title, setTitle]         = useState(contact?.title || '')
  const [notes, setNotes]         = useState(contact?.notes || '')
  const [addressBookUrl, setAddressBookUrl] = useState(
    contact?.addressBookUrl || defaultAddressBookUrl || addressBooks[0]?.url || ''
  )
  const [emails, setEmails] = useState<EmailEntry[]>(
    contact?.email?.map(e => ({ value: e.value, type: e.type || 'home' })) ?? [{ value: '', type: 'home' }]
  )
  const [phones, setPhones] = useState<PhoneEntry[]>(
    contact?.phone?.map(p => ({ value: p.value, type: p.type || 'mobile' })) ?? [{ value: '', type: 'mobile' }]
  )
  const [photo, setPhoto]           = useState<string | undefined>(contact?.photo)
  const [birthday, setBirthday]     = useState(contact?.birthday || '')
  const [anniversary, setAnniversary] = useState(contact?.anniversary || '')
  const [tagInput, setTagInput]     = useState('')
  const [categories, setCategories] = useState<string[]>(contact?.categories ?? [])
  const [starred, setStarred]       = useState(contact?.starred ?? false)

  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || org || ''

  // ── Photo handling ────────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // Resize to max 256×256 via canvas
      const img = new Image()
      img.onload = () => {
        const MAX = 256
        const scale = Math.min(MAX / img.width, MAX / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        setPhoto(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  function addTag(raw: string) {
    const tag = raw.trim()
    if (!tag || categories.includes(tag)) return
    setCategories(prev => [...prev, tag])
    setTagInput('')
  }
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    if (e.key === 'Backspace' && !tagInput && categories.length > 0) {
      setCategories(prev => prev.slice(0, -1))
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('First name, last name, or company is required'); return }
    setSaving(true); setError(null)
    try {
      const cleanEmails = emails.filter(e => e.value.trim()).map(e => ({ value: e.value.trim(), type: e.type }))
      const cleanPhones = phones.filter(p => p.value.trim()).map(p => ({ value: p.value.trim(), type: p.type }))
      const finalCategories = tagInput.trim()
        ? [...categories, tagInput.trim()]
        : categories

      const shared = {
        fullName: fullName.trim(),
        firstName: firstName.trim() || undefined,
        lastName:  lastName.trim()  || undefined,
        email: cleanEmails.length > 0 ? cleanEmails : undefined,
        phone: cleanPhones.length > 0 ? cleanPhones : undefined,
        org:   org.trim()   || undefined,
        title: title.trim() || undefined,
        notes: notes.trim() || undefined,
        photo: photo || undefined,
        birthday:    birthday    || undefined,
        anniversary: anniversary || undefined,
        categories: finalCategories.length > 0 ? finalCategories : undefined,
        starred:    starred || undefined,
      }

      if (isNew) {
        await onSave({ addressBookUrl, ...shared } as CreateContactBody, true)
      } else {
        await onSave({
          uid: contact!.uid,
          contactUrl: contact!.url,
          addressBookUrl: contact!.addressBookUrl,
          etag: contact!.etag,
          ...shared,
        } as UpdateContactBody, false)
      }
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!contact || !onDelete) return
    setDeleting(true)
    try { await onDelete(contact); onClose() }
    catch (err: any) { setError(err?.response?.data?.error || err?.message || 'Failed to delete'); setDeleting(false) }
  }

  function updateEmail(i: number, field: 'value' | 'type', val: string) {
    setEmails(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }
  function updatePhone(i: number, field: 'value' | 'type', val: string) {
    setPhones(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{isNew ? 'New contact' : 'Edit contact'}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStarred(s => !s)}
              title={starred ? 'Remove from favorites' : 'Add to favorites'}
              className="transition-colors"
            >
              {starred ? (
                <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-300 hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-4 space-y-4">

            {/* Photo */}
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200 cursor-pointer relative group"
                onClick={() => document.getElementById('photo-input')?.click()}
                title="Upload photo"
              >
                {photo ? (
                  <img src={photo} alt="Contact" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
              </div>
              <input id="photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Click to upload photo</p>
                {photo && (
                  <button type="button" onClick={() => setPhoto(undefined)}
                    className="text-xs text-red-500 hover:text-red-700 mt-1 transition-colors">
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">First name</label>
                <input ref={firstRef} type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="First"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Last name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Last"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Company + Title */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                <input type="text" value={org} onChange={e => setOrg(e.target.value)}
                  placeholder="Company"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Job title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Email addresses */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <div className="space-y-2">
                {emails.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="email" value={e.value} onChange={ev => updateEmail(i, 'value', ev.target.value)}
                      placeholder="Email address"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={e.type} onChange={ev => updateEmail(i, 'type', ev.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {EMAIL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    {emails.length > 1 && (
                      <button type="button" onClick={() => setEmails(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setEmails(prev => [...prev, { value: '', type: 'home' }])}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                  + Add email
                </button>
              </div>
            </div>

            {/* Phone numbers */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <div className="space-y-2">
                {phones.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="tel" value={p.value} onChange={ev => updatePhone(i, 'value', ev.target.value)}
                      placeholder="Phone number"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={p.type} onChange={ev => updatePhone(i, 'type', ev.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {PHONE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    {phones.length > 1 && (
                      <button type="button" onClick={() => setPhones(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setPhones(prev => [...prev, { value: '', type: 'mobile' }])}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                  + Add phone
                </button>
              </div>
            </div>

            {/* Birthday + Anniversary */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Birthday</label>
                <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Anniversary</label>
                <input type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Tags / Categories */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-lg min-h-[40px] focus-within:ring-2 focus-within:ring-blue-500">
                {categories.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {tag}
                    <button type="button" onClick={() => setCategories(prev => prev.filter(t => t !== tag))}
                      className="hover:text-blue-900 transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => { if (tagInput.trim()) addTag(tagInput) }}
                  placeholder={categories.length === 0 ? 'Add tags…' : ''}
                  className="flex-1 min-w-[80px] text-sm outline-none bg-transparent"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add</p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Add notes…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Address book selector (new contacts only, if multiple books) */}
            {isNew && addressBooks.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Save to</label>
                <select value={addressBookUrl} onChange={e => setAddressBookUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {addressBooks.map(b => <option key={b.id} value={b.url}>{b.displayName}</option>)}
                </select>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              {!isNew && onDelete && (
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Delete contact'}
                </button>
              )}
              {!isNew && contact?.url && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const blob = await exportSingleContact(contact.url, contact.fullName)
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${contact.fullName.replace(/\s+/g, '_')}.vcf`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch {}
                  }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  title="Download vCard"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5 0l4.5-4.5M12 21V7.5" />
                  </svg>
                  Export vCard
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : isNew ? 'Create contact' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
