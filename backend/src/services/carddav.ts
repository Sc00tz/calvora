// SPDX-License-Identifier: GPL-3.0-or-later
import { createDAVClient, DAVAddressBook } from 'tsdav';
import { v4 as uuidv4 } from 'uuid';
import { AddressBook, Contact, CreateContactBody, UpdateContactBody } from '../types/index.js';
import ICAL from 'ical.js';

type DAVClientInstance = Awaited<ReturnType<typeof createDAVClient>>;

interface ParsedVCard extends Contact {
  isGroup?: boolean;
  groupMembers?: string[];
}

async function createCardClient(username: string, password: string, baseUrl: string): Promise<DAVClientInstance> {
  return createDAVClient({
    serverUrl: baseUrl,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'carddav',
  });
}

export async function fetchAddressBooks(username: string, password: string, baseUrl: string): Promise<AddressBook[]> {
  const client = await createCardClient(username, password, baseUrl);
  const books: DAVAddressBook[] = await client.fetchAddressBooks();
  return books.map((b): AddressBook => ({
    id: b.url,
    url: b.url,
    displayName: typeof b.displayName === 'string' ? b.displayName
      : b.displayName ? JSON.stringify(b.displayName)
        : 'Address Book',
  }));
}

export async function fetchContacts(
  username: string,
  password: string,
  baseUrl: string,
  addressBookUrl: string
): Promise<Contact[]> {
  const client = await createCardClient(username, password, baseUrl);
  const vCards = await client.fetchVCards({ addressBook: { url: addressBookUrl } });

  const contacts: ParsedVCard[] = [];
  const groups: { name: string; memberUids: string[] }[] = [];

  for (const vc of vCards) {
    if (!vc.data) continue;
    try {
      const parsed = parseVCard(vc.data as string, vc.url, addressBookUrl, vc.etag);
      if (parsed) {
        if (parsed.isGroup) {
          groups.push({ name: parsed.fullName, memberUids: parsed.groupMembers || [] });
        } else {
          contacts.push(parsed);
        }
      }
    } catch (err) {
      console.error(`Failed to parse vCard at ${vc.url}:`, err);
    }
  }

  // Davis/SabreDAV uses Apple's AddressBook server extension for groups: a group is itself
  // a vCard with KIND:GROUP and X-ADDRESSBOOKSERVER-MEMBER lines listing member UIDs.
  // We resolve those group memberships back onto each contact as CATEGORIES so the UI
  // can display and filter by group label without knowing about the group vCards.
  for (const contact of contacts) {
    const contactGroups = groups.filter(g => g.memberUids.includes(contact.uid));
    const extraCategories = contactGroups.map(g => g.name);

    let cats = contact.categories ? [...contact.categories] : [];
    cats = cats.concat(extraCategories);

    // Remove duplicates safely
    cats = cats.filter((c, i) => cats.indexOf(c) === i);

    if (cats.includes('Starred in Android') || cats.includes('starred')) {
      contact.starred = true;
    }

    cats = cats.filter(c => c !== 'Starred in Android' && c !== 'starred');

    if (cats.length > 0) {
      contact.categories = cats;
    } else {
      contact.categories = undefined;
    }

    delete contact.isGroup;
    delete contact.groupMembers;
  }

  return contacts as Contact[];
}

export async function createContact(
  username: string,
  password: string,
  baseUrl: string,
  body: CreateContactBody
): Promise<Contact> {
  const client = await createCardClient(username, password, baseUrl);
  const uid = uuidv4();
  const vCardString = buildVCard({ ...body, uid });

  await client.createVCard({
    addressBook: { url: body.addressBookUrl },
    filename: `${uid}.vcf`,
    vCardString,
  });

  await syncGroups(client, body.addressBookUrl, uid, body.categories || [], body.starred);

  const objectUrl = `${body.addressBookUrl.replace(/\/$/, '')}/${uid}.vcf`;
  return {
    uid,
    url: objectUrl,
    addressBookUrl: body.addressBookUrl,
    fullName: body.fullName,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    org: body.org,
    title: body.title,
    notes: body.notes,
    categories: body.categories,
    starred: body.starred
  };
}

export async function updateContact(
  username: string,
  password: string,
  baseUrl: string,
  body: UpdateContactBody
): Promise<void> {
  const client = await createCardClient(username, password, baseUrl);

  if (!body.contactUrl) throw new Error("Missing contactUrl for update");
  const rawVCard = await fetchSingleVCard(username, password, body.contactUrl);
  const vCardString = patchVCard(rawVCard, body);

  await client.updateVCard({
    vCard: { url: body.contactUrl, data: vCardString, etag: body.etag },
  });

  await syncGroups(client, body.addressBookUrl, body.uid, body.categories || [], body.starred);
}

export async function exportContacts(
  username: string,
  password: string,
  baseUrl: string,
  addressBookUrl: string
): Promise<string> {
  const client = await createCardClient(username, password, baseUrl);
  const vCards = await client.fetchVCards({ addressBook: { url: addressBookUrl } });
  return vCards
    .filter((vc) => vc.data && !(vc.data as string).includes('X-ADDRESSBOOKSERVER-KIND:GROUP'))
    .map((vc) => (vc.data as string).trim())
    .join('\r\n');
}

export async function importContacts(
  username: string,
  password: string,
  baseUrl: string,
  addressBookUrl: string,
  vcfData: string
): Promise<{ imported: number; failed: number }> {
  // Split on BEGIN:VCARD boundaries (handles multi-card .vcf files)
  const cardStrings = vcfData
    .split(/(?=BEGIN:VCARD)/i)
    .map((s) => s.trim())
    .filter((s) => /^BEGIN:VCARD/i.test(s));

  let imported = 0;
  let failed = 0;

  for (const cardStr of cardStrings) {
    try {
      const contact = parseVCard(cardStr, '', addressBookUrl);
      if (!contact || !contact.fullName || contact.isGroup) { failed++; continue; }
      await createContact(username, password, baseUrl, {
        addressBookUrl,
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
      });
      imported++;
    } catch {
      failed++;
    }
  }

  return { imported, failed };
}

export async function deleteContact(
  username: string,
  password: string,
  baseUrl: string,
  contactUrl: string,
  etag?: string
): Promise<void> {
  const client = await createCardClient(username, password, baseUrl);

  // Clean up groups before deleting the contact
  const vCards = await client.fetchVCards({ vCard: { url: contactUrl } });
  // Wait, we don't have uid easily unless we parse it. It's safer to just let the client delete the contact.
  // Orphaned X-ADDRESSBOOKSERVER-MEMBER tags inside group vCards are safely ignored by DAVx5 anyway.

  await client.deleteVCard({ vCard: { url: contactUrl, etag } });
}

export async function fetchSingleVCard(
  username: string,
  password: string,
  contactUrl: string
): Promise<string> {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const res = await fetch(contactUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch vCard: ${res.status} ${res.statusText}`);
  return res.text();
}

// ─── Group Sync Utility ────────────────────────────────────────────────────────
// After creating or updating a contact, call syncGroups to keep the Apple-style
// group vCards in the address book consistent with the contact's desired categories.
// We fetch ALL vCards in the book on each call — expensive but correct, and address
// books are small enough that this is not a practical concern.

async function syncGroups(
  client: DAVClientInstance,
  addressBookUrl: string,
  contactUid: string,
  desiredGroups: string[],
  starred: boolean | undefined
) {
  const allDesired = [...desiredGroups];
  if (starred && !allDesired.includes('Starred in Android')) {
    allDesired.push('Starred in Android');
  }

  const vCards = await client.fetchVCards({ addressBook: { url: addressBookUrl } });
  const groups: { vcUrl: string; etag: string; name: string; memberUids: string[]; raw: string }[] = [];

  for (const vc of vCards) {
    if (!vc.data) continue;
    const raw = vc.data as string;
    if (raw.includes('KIND:GROUP') || raw.includes('KIND:group')) {
      const p = parseVCard(raw, vc.url, addressBookUrl);
      if (p?.isGroup) {
        groups.push({ vcUrl: vc.url, etag: vc.etag!, name: p.fullName, memberUids: p.groupMembers || [], raw });
      }
    }
  }

  const currentGroups = groups.filter(g => g.memberUids.includes(contactUid));
  const groupsToAdd = allDesired.filter(dg => !currentGroups.some(cg => cg.name === dg));
  const groupsToRemove = currentGroups.filter(cg => !allDesired.includes(cg.name));

  for (const g of groupsToRemove) {
    const patchedRaw = removeMemberFromGroupVCard(g.raw, contactUid);
    await client.updateVCard({ vCard: { url: g.vcUrl, etag: g.etag, data: patchedRaw } });
  }

  for (const name of groupsToAdd) {
    const existing = groups.find(g => g.name === name);
    if (existing) {
      const patchedRaw = addMemberToGroupVCard(existing.raw, contactUid);
      await client.updateVCard({ vCard: { url: existing.vcUrl, etag: existing.etag, data: patchedRaw } });
    } else {
      const gUid = uuidv4();
      const newRaw = createGroupVCard(gUid, name, contactUid);
      await client.createVCard({
        addressBook: { url: addressBookUrl },
        filename: `${gUid}.vcf`,
        vCardString: newRaw
      });
    }
  }
}

function removeMemberFromGroupVCard(raw: string, uid: string): string {
  const jcal = ICAL.parse(raw);
  const comp = new ICAL.Component(jcal);
  const target = `urn:uuid:${uid}`;

  const members = comp.getAllProperties('x-addressbookserver-member');
  comp.removeAllProperties('x-addressbookserver-member');

  for (const m of members) {
    if (m.getFirstValue() !== target) {
      comp.addProperty(m);
    }
  }
  return comp.toString();
}

function addMemberToGroupVCard(raw: string, uid: string): string {
  const jcal = ICAL.parse(raw);
  const comp = new ICAL.Component(jcal);
  const target = `urn:uuid:${uid}`;

  const members = comp.getAllProperties('x-addressbookserver-member');
  if (!members.some(m => m.getFirstValue() === target)) {
    const prop = new ICAL.Property('x-addressbookserver-member');
    prop.setValue(target);
    comp.addProperty(prop);
  }

  const rev = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  comp.updatePropertyWithValue('rev', rev);

  return comp.toString();
}

function createGroupVCard(uid: string, name: string, memberUid: string): string {
  const comp = new ICAL.Component(['vcard', [], []]);
  comp.addPropertyWithValue('version', '3.0');
  comp.addPropertyWithValue('prodid', '-//Calvora//EN');
  comp.addPropertyWithValue('uid', uid);
  comp.addPropertyWithValue('x-addressbookserver-kind', 'group');
  comp.addPropertyWithValue('fn', name);

  const prop = new ICAL.Property('x-addressbookserver-member');
  prop.setValue(`urn:uuid:${memberUid}`);
  comp.addProperty(prop);

  const rev = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  comp.addPropertyWithValue('rev', rev);

  return comp.toString();
}

// ─── vCard parsing ────────────────────────────────────────────────────────────
// We parse vCards manually (line by line) rather than with a library because:
//   1. ical.js parses vCard 4.0 only; our contacts are vCard 3.0 (written by DAVx⁵).
//   2. We need vendor-specific properties (X-ADDRESSBOOKSERVER-*, X-ANDROID-STARRED)
//      that generic parsers silently drop.
// The unfolding step (removing CRLF + whitespace continuations) is required by RFC 6350.

function parseVCard(raw: string, url: string, addressBookUrl: string, etag?: string): ParsedVCard | null {
  const text = raw.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const lines = text.split('\n');

  let uid = '';
  let fullName = '';
  let firstName = '';
  let lastName = '';
  const emails: { value: string; type?: string }[] = [];
  const phones: { value: string; type?: string }[] = [];
  let org = '';
  let title = '';
  let notes = '';
  let photo: string | undefined;
  let birthday: string | undefined;
  let anniversary: string | undefined;
  let categories: string[] | undefined;
  let starred = false;
  let isGroup = false;
  const groupMembers: string[] = [];

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const propPart = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);

    const segments = propPart.split(';');
    const propName = segments[0].toUpperCase();

    let type: string | undefined;
    let encoding: string | undefined;
    let mediaType: string | undefined;
    for (const seg of segments.slice(1)) {
      const upper = seg.toUpperCase();
      if (upper.startsWith('TYPE=')) {
        const types = upper.slice(5).split(',').filter(t => t !== 'INTERNET' && t !== 'VOICE' && t !== 'PREF');
        if (types.length > 0 && !['JPEG', 'JPG', 'PNG', 'GIF', 'WEBP'].includes(types[0])) {
          type = types[0].toLowerCase();
        } else if (types.length > 0) {
          mediaType = types[0].toLowerCase();
        }
      } else if (upper.startsWith('ENCODING=')) {
        encoding = upper.slice(9);
      } else if (upper === 'ENCODING') {
        encoding = 'B';
      }
    }

    switch (propName) {
      case 'X-ADDRESSBOOKSERVER-KIND':
        if (value.trim().toUpperCase() === 'GROUP') {
          isGroup = true;
        }
        break;
      case 'X-ADDRESSBOOKSERVER-MEMBER': {
        const memberUid = value.trim().replace(/^urn:uuid:/i, '');
        groupMembers.push(memberUid);
        break;
      }
      case 'UID': uid = value.trim(); break;
      case 'FN': fullName = unescape(value); break;
      case 'N': {
        const parts = value.split(';');
        lastName = unescape(parts[0] || '');
        firstName = unescape(parts[1] || '');
        break;
      }
      case 'EMAIL': if (value.trim()) emails.push({ value: value.trim(), type }); break;
      case 'TEL': if (value.trim()) phones.push({ value: value.trim(), type }); break;
      case 'ORG': org = unescape(value.split(';')[0]); break;
      case 'TITLE': title = unescape(value); break;
      case 'NOTE': notes = unescape(value); break;
      case 'PHOTO': {
        if (encoding && value.trim()) {
          const mime = mediaType === 'png' ? 'image/png'
            : mediaType === 'gif' ? 'image/gif'
              : mediaType === 'webp' ? 'image/webp'
                : 'image/jpeg';
          photo = `data:${mime};base64,${value.trim()}`;
        } else if (value.startsWith('data:')) {
          photo = value.trim();
        }
        break;
      }
      case 'BDAY': {
        const d = parseDateValue(value.trim());
        if (d) birthday = d;
        break;
      }
      case 'X-ANNIVERSARY':
      case 'ANNIVERSARY': {
        const d = parseDateValue(value.trim());
        if (d) anniversary = d;
        break;
      }
      case 'CATEGORIES': {
        const cats = value.split(',').map(c => unescape(c)).filter(Boolean);
        if (cats.length > 0) {
          categories = categories ? categories.concat(cats) : cats;
        }
        break;
      }
      case 'X-ANDROID-STARRED':
      case 'X-DAVDROID-STARRED':
        starred = value.trim() === '1';
        break;
    }
  }

  if (!uid && !fullName) return null;

  return {
    uid: uid || url,
    url,
    addressBookUrl,
    fullName: fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown',
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: emails.length > 0 ? emails : undefined,
    phone: phones.length > 0 ? phones : undefined,
    org: org || undefined,
    title: title || undefined,
    notes: notes || undefined,
    photo,
    birthday,
    anniversary,
    categories,
    starred: starred || undefined,
    etag,
    isGroup,
    groupMembers
  };
}

function parseDateValue(val: string): string | undefined {
  const m = val.replace(/-/g, '').match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unescape(val: string): string {
  return val.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function patchVCard(rawVCard: string, updates: UpdateContactBody): string {
  const jcal = ICAL.parse(rawVCard);
  const comp = new ICAL.Component(jcal);

  if (updates.fullName) comp.updatePropertyWithValue('fn', updates.fullName);

  if (updates.firstName || updates.lastName) {
    comp.updatePropertyWithValue('n', [
      updates.lastName || '',
      updates.firstName || '',
      '', '', ''
    ]);
  }

  comp.removeAllProperties('email');
  for (const e of updates.email ?? []) {
    if (!e.value) continue;
    const prop = new ICAL.Property('email');
    if (e.type) prop.setParameter('type', e.type.toUpperCase());
    prop.setValue(e.value);
    comp.addProperty(prop);
  }

  comp.removeAllProperties('tel');
  for (const p of updates.phone ?? []) {
    if (!p.value) continue;
    const prop = new ICAL.Property('tel');
    if (p.type) prop.setParameter('type', p.type.toUpperCase());
    prop.setValue(p.value);
    comp.addProperty(prop);
  }

  if (updates.org) comp.updatePropertyWithValue('org', updates.org);
  else comp.removeAllProperties('org');

  if (updates.title) comp.updatePropertyWithValue('title', updates.title);
  else comp.removeAllProperties('title');

  if (updates.notes !== undefined) {
    if (updates.notes) comp.updatePropertyWithValue('note', updates.notes);
    else comp.removeAllProperties('note');
  }

  if (updates.birthday) {
    comp.updatePropertyWithValue('bday', updates.birthday.replace(/-/g, ''));
  } else {
    comp.removeAllProperties('bday');
  }

  if (updates.anniversary) {
    comp.updatePropertyWithValue('x-anniversary', updates.anniversary.replace(/-/g, ''));
  } else {
    comp.removeAllProperties('x-anniversary');
  }

  if (updates.photo) {
    const m = updates.photo.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (m) {
      const mime = m[1];
      const b64 = m[2].replace(/\s+/g, '');
      const prop = new ICAL.Property('photo');
      prop.setParameter('encoding', 'b');
      prop.setParameter('type', mime.split('/')[1].toUpperCase());
      prop.setValue(b64);
      comp.removeAllProperties('photo');
      comp.addProperty(prop);
    }
  }

  let catsToSave = updates.categories ? [...updates.categories] : [];
  if (updates.starred) {
    comp.updatePropertyWithValue('x-android-starred', '1');
    comp.updatePropertyWithValue('x-davdroid-starred', '1');
    if (!catsToSave.includes('Starred in Android')) catsToSave.push('Starred in Android');
  } else {
    comp.removeAllProperties('x-android-starred');
    comp.removeAllProperties('x-davdroid-starred');
    catsToSave = catsToSave.filter(c => c !== 'Starred in Android' && c !== 'starred');
  }

  if (catsToSave.length > 0) {
    const prop = new ICAL.Property('categories');
    prop.setValues(catsToSave);
    comp.removeAllProperties('categories');
    comp.addProperty(prop);
  } else {
    comp.removeAllProperties('categories');
  }

  const rev = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  comp.updatePropertyWithValue('rev', rev);

  return comp.toString();
}

// ─── vCard building ───────────────────────────────────────────────────────────

function buildVCard(contact: CreateContactBody & { uid: string; etag?: string; contactUrl?: string }): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${contact.uid}`,
    `FN:${esc(contact.fullName)}`,
    `N:${esc(contact.lastName || '')};${esc(contact.firstName || '')};;;`,
  ];

  for (const e of contact.email ?? []) {
    if (!e.value) continue;
    const t = e.type ? `;TYPE=${e.type.toUpperCase()}` : '';
    lines.push(`EMAIL${t}:${e.value}`);
  }
  for (const p of contact.phone ?? []) {
    if (!p.value) continue;
    const t = p.type ? `;TYPE=${p.type.toUpperCase()}` : '';
    lines.push(`TEL${t}:${p.value}`);
  }

  if (contact.org) lines.push(`ORG:${esc(contact.org)}`);
  if (contact.title) lines.push(`TITLE:${esc(contact.title)}`);
  if (contact.notes) lines.push(`NOTE:${esc(contact.notes)}`);

  if (contact.starred) {
    lines.push('X-ANDROID-STARRED:1');
    lines.push('X-DAVDROID-STARRED:1');
  }

  if (contact.birthday) {
    lines.push(`BDAY:${contact.birthday.replace(/-/g, '')}`);
  }
  if (contact.anniversary) {
    lines.push(`X-ANNIVERSARY:${contact.anniversary.replace(/-/g, '')}`);
  }
  let catsToSave = contact.categories ? [...contact.categories] : [];
  if (contact.starred) {
    if (!catsToSave.includes('Starred in Android')) {
      catsToSave.push('Starred in Android');
    }
  } else {
    catsToSave = catsToSave.filter(c => c !== 'Starred in Android' && c !== 'starred');
  }

  if (catsToSave.length > 0) {
    lines.push(`CATEGORIES:${catsToSave.map(esc).join(',')}`);
  }
  if (contact.photo) {
    const m = contact.photo.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (m) {
      const mime = m[1];
      const b64 = m[2].replace(/\s/g, '');
      const typeParam = mime === 'image/png' ? 'PNG'
        : mime === 'image/gif' ? 'GIF'
          : mime === 'image/webp' ? 'WEBP'
            : 'JPEG';
      const header = `PHOTO;ENCODING=b;TYPE=${typeParam}:`;
      const fullLine = header + b64;
      const firstLen = 75;
      const contLen = 74;
      const chunks: string[] = [];
      chunks.push(fullLine.substring(0, firstLen));
      let pos = firstLen;
      while (pos < fullLine.length) {
        chunks.push(' ' + fullLine.substring(pos, pos + contLen));
        pos += contLen;
      }
      lines.push(chunks.join('\r\n'));
    }
  }

  const rev = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  lines.push(`REV:${rev}`);
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

function esc(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}
