// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { fetchAddressBooks, fetchContacts, createContact, updateContact, deleteContact, exportContacts, importContacts, fetchSingleVCard } from '../services/carddav.js';
import { requireSession } from '../middleware/session.js';
import { CreateContactBody, UpdateContactBody } from '../types/index.js';

const router = Router();

// GET /api/contacts/export-single?contactUrl=...&filename=...
router.get('/export-single', requireSession, async (req: Request, res: Response) => {
  const { contactUrl, filename } = req.query as { contactUrl?: string; filename?: string };
  const { username, password } = req.session;
  if (!contactUrl) { res.status(400).json({ error: 'contactUrl is required' }); return; }
  try {
    const vcfData = await fetchSingleVCard(username!, password!, contactUrl);
    const safeFilename = (filename || 'contact').replace(/[^a-zA-Z0-9_\-. ]/g, '_') + '.vcf';
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(vcfData);
  } catch (err: any) {
    console.error('Single export failed:', err?.message || err);
    res.status(502).json({ error: 'Failed to export contact' });
  }
});

// GET /api/contacts/export?addressBookUrl=...
router.get('/export', requireSession, async (req: Request, res: Response) => {
  const { addressBookUrl } = req.query as { addressBookUrl?: string };
  const { username, password, davisBaseUrl } = req.session;
  if (!addressBookUrl) { res.status(400).json({ error: 'addressBookUrl is required' }); return; }
  try {
    const vcfData = await exportContacts(username!, password!, davisBaseUrl!, addressBookUrl);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.vcf"');
    res.send(vcfData);
  } catch (err: any) {
    console.error('Export failed:', err?.message || err);
    res.status(502).json({ error: 'Export failed' });
  }
});

// POST /api/contacts/import
router.post('/import', requireSession, async (req: Request, res: Response) => {
  const { addressBookUrl, vcfData } = req.body as { addressBookUrl?: string; vcfData?: string };
  const { username, password, davisBaseUrl } = req.session;
  if (!addressBookUrl || !vcfData) {
    res.status(400).json({ error: 'addressBookUrl and vcfData are required' }); return;
  }
  try {
    const result = await importContacts(username!, password!, davisBaseUrl!, addressBookUrl, vcfData);
    res.json(result);
  } catch (err: any) {
    console.error('Import failed:', err?.message || err);
    res.status(502).json({ error: 'Import failed' });
  }
});

// GET /api/contacts/address-books
router.get('/address-books', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  try {
    const books = await fetchAddressBooks(username!, password!, davisBaseUrl!);
    res.json(books);
  } catch (err: any) {
    console.error('Failed to fetch address books:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch address books from Davis' });
  }
});

// GET /api/contacts/all
router.get('/all', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  try {
    const books = await fetchAddressBooks(username!, password!, davisBaseUrl!);
    const results = await Promise.all(
      books.map(b => fetchContacts(username!, password!, davisBaseUrl!, b.url))
    );
    res.json(results.flat());



  } catch (err: any) {
    console.error('Failed to fetch all contacts:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch contacts from Davis' });
  }
});


// GET /api/contacts?addressBookUrl=...
router.get('/', requireSession, async (req: Request, res: Response) => {
  const { addressBookUrl } = req.query as { addressBookUrl?: string };
  const { username, password, davisBaseUrl } = req.session;
  if (!addressBookUrl) { res.status(400).json({ error: 'addressBookUrl is required' }); return; }
  try {
    const contacts = await fetchContacts(username!, password!, davisBaseUrl!, addressBookUrl);
    res.json(contacts);
  } catch (err: any) {
    console.error('Failed to fetch contacts:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch contacts from Davis' });
  }
});

// POST /api/contacts
router.post('/', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as CreateContactBody;
  if (!body.addressBookUrl || !body.fullName) {
    res.status(400).json({ error: 'addressBookUrl and fullName are required' }); return;
  }
  try {
    const contact = await createContact(username!, password!, davisBaseUrl!, body);
    res.status(201).json(contact);
  } catch (err: any) {
    console.error('Failed to create contact:', err?.message || err);
    res.status(502).json({ error: 'Failed to create contact in Davis' });
  }
});

// PUT /api/contacts/:uid
router.put('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as UpdateContactBody;
  body.uid = req.params.uid;
  if (!body.contactUrl || !body.addressBookUrl || !body.fullName) {
    res.status(400).json({ error: 'contactUrl, addressBookUrl, and fullName are required' }); return;
  }
  try {
    await updateContact(username!, password!, davisBaseUrl!, body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to update contact:', err?.message || err);
    res.status(502).json({ error: 'Failed to update contact in Davis' });
  }
});

// DELETE /api/contacts/:uid?contactUrl=...
router.delete('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const { contactUrl, etag } = req.query as { contactUrl?: string; etag?: string };
  if (!contactUrl) { res.status(400).json({ error: 'contactUrl query param is required' }); return; }
  try {
    await deleteContact(username!, password!, davisBaseUrl!, contactUrl, etag);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to delete contact:', err?.message || err);
    res.status(502).json({ error: 'Failed to delete contact in Davis' });
  }
});

export default router;
