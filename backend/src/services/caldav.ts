// SPDX-License-Identifier: GPL-3.0-or-later
import { createDAVClient, DAVCalendar, DAVCalendarObject } from 'tsdav';
import ICAL from 'ical.js';
import { v4 as uuidv4 } from 'uuid';
import { CalendarInfo, CalendarEvent, CreateEventBody, UpdateEventBody, CalendarTask, CreateTaskBody, UpdateTaskBody } from '../types/index.js';

type DAVClientInstance = Awaited<ReturnType<typeof createDAVClient>>;

async function createClient(username: string, password: string, baseUrl: string): Promise<DAVClientInstance> {
  return createDAVClient({
    serverUrl: baseUrl,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

export async function verifyCredentials(username: string, password: string, baseUrl: string): Promise<boolean> {
  try {
    const client = await createClient(username, password, baseUrl);
    await client.fetchCalendars();
    return true;
  } catch (err: any) {
    console.error('verifyCredentials failed for', username, 'at', baseUrl, 'Error:', err.message || err);
    return false;
  }
}


export async function fetchCalendars(username: string, password: string, baseUrl: string): Promise<CalendarInfo[]> {
  const client = await createClient(username, password, baseUrl);

  const davCalendars: DAVCalendar[] = await client.fetchCalendars();

  // Separately check which calendars have the cs:shared property set.
  // Davis/SabreDAV sets this on calendars that belong to another principal
  // but are shared (delegated) to the current user.
  const sharedUrls = await fetchSharedCalendarUrls(username, password, baseUrl, davCalendars.map(c => c.url));

  return davCalendars
    .filter((cal) => cal.components?.includes('VEVENT') || cal.components?.includes('VTODO'))
    .map((cal): CalendarInfo => {
      const rawColor = typeof cal.calendarColor === 'string' ? cal.calendarColor : undefined;
      let color = rawColor || '#3788d8';
      if (color.length === 9 && color.startsWith('#')) color = color.slice(0, 7);

      const displayName =
        typeof cal.displayName === 'string' ? cal.displayName
        : cal.displayName ? JSON.stringify(cal.displayName)
        : 'Unnamed Calendar';

      return {
        id: cal.url,
        url: cal.url,
        displayName,
        color,
        isShared: sharedUrls.has(cal.url),
        canWrite: !(cal as any).readOnly,
        supportsEvents: cal.components?.includes('VEVENT') ?? false,
        supportsTasks: cal.components?.includes('VTODO') ?? false,
      };
    });
}

// Returns the set of calendar URLs that have the cs:shared property set,
// indicating they are shared with (not owned by) the current user.
async function fetchSharedCalendarUrls(
  username: string,
  password: string,
  baseUrl: string,
  calendarUrls: string[]
): Promise<Set<string>> {
  if (calendarUrls.length === 0) return new Set();

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  // Use allprop — SabreDAV/Davis only exposes cs:shared via allprop, not via targeted prop requests
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:allprop/>
</d:propfind>`;

  const shared = new Set<string>();

  await Promise.all(calendarUrls.map(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Depth': '0',
          'Authorization': `Basic ${auth}`,
        },
        body,
      });
      const text = await res.text();
      // SabreDAV includes <cs:shared/> (or namespace-prefixed equivalent) in the allprop
      // 200 propstat block for calendars delegated/shared to this user from another principal.
      // Split into propstat blocks and check if any 200-OK block contains the shared element.
      const propstatBlocks = text.split(/<[^>]*propstat[^>]*>/i);
      const isShared = propstatBlocks.some(block =>
        /:shared\s*\/>/.test(block) && /HTTP\/1\.1 200/.test(block)
      );
      if (isShared) {
        shared.add(url);
      }
    } catch {
      // Ignore fetch errors for individual calendars
    }
  }));

  return shared;
}

export async function fetchEvents(
  username: string,
  password: string,
  baseUrl: string,
  calendarUrl: string,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const client = await createClient(username, password, baseUrl);

  const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl },
    timeRange: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });

  const events: CalendarEvent[] = [];
  for (const obj of objects) {
    if (!obj.data) continue;
    try {
      const parsed = parseIcalToEvents(obj.data as string, obj.url, calendarUrl, obj.etag, start, end);
      events.push(...parsed);
    } catch (err) {
      console.error(`Failed to parse event at ${obj.url}:`, err);
    }
  }
  return events;
}

function icalValueToString(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val;
  return String(val);
}

function extractReminder(veventComp: ICAL.Component): number | undefined {
  const valarms = veventComp.getAllSubcomponents('valarm');
  for (const valarm of valarms) {
    const trigger = valarm.getFirstPropertyValue('trigger');
    if (trigger instanceof ICAL.Duration) {
      const secs = trigger.toSeconds();
      if (secs <= 0) return Math.abs(secs) / 60;
    }
  }
  return undefined;
}

function parseMasterVevent(
  vevent: ICAL.Component, url: string, calendarUrl: string, uid: string, etag?: string
): CalendarEvent | null {
  const summary = icalValueToString(vevent.getFirstPropertyValue('summary')) || '(No title)';
  const description = icalValueToString(vevent.getFirstPropertyValue('description'));
  const location = icalValueToString(vevent.getFirstPropertyValue('location'));

  const dtstart = vevent.getFirstProperty('dtstart');
  if (!dtstart) return null;
  const startVal = dtstart.getFirstValue() as ICAL.Time;
  const isAllDay = startVal.isDate;

  let startIso: string;
  let endIso: string;
  const dtend = vevent.getFirstProperty('dtend');
  const durationProp = vevent.getFirstProperty('duration');

  if (isAllDay) {
    startIso = startVal.toString();
    if (dtend) {
      endIso = (dtend.getFirstValue() as ICAL.Time).toString();
    } else {
      const endTime = startVal.clone();
      endTime.addDuration(ICAL.Duration.fromData({ days: 1 }));
      endIso = endTime.toString();
    }
  } else {
    startIso = startVal.toJSDate().toISOString();
    if (dtend) {
      endIso = (dtend.getFirstValue() as ICAL.Time).toJSDate().toISOString();
    } else if (durationProp) {
      const dur = durationProp.getFirstValue() as ICAL.Duration;
      const endTime = startVal.clone();
      endTime.addDuration(dur);
      endIso = endTime.toJSDate().toISOString();
    } else {
      endIso = startIso;
    }
  }

  const rruleProp = vevent.getFirstProperty('rrule');
  const rrule = rruleProp ? (rruleProp.getFirstValue() as ICAL.Recur).toString() : undefined;
  const reminder = extractReminder(vevent);

  return { uid, url, calendarUrl, title: summary, start: startIso, end: endIso, allDay: isAllDay, description, location, rrule, reminder, etag };
}

function parseIcalToEvents(
  icalString: string, url: string, calendarUrl: string, etag?: string,
  rangeStart?: Date, rangeEnd?: Date
): CalendarEvent[] {
  const jcalData = ICAL.parse(icalString);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');
  const events: CalendarEvent[] = [];

  // Group VEVENTs by UID so we can associate the master event with its RECURRENCE-ID exceptions.
  // A .ics file for a recurring event contains one master VEVENT (no RECURRENCE-ID) plus zero or
  // more exception VEVENTs (with RECURRENCE-ID) for individual occurrences that were edited.
  const byUid = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  for (const vevent of vevents) {
    const uid = icalValueToString(vevent.getFirstPropertyValue('uid')) || uuidv4();
    if (!byUid.has(uid)) byUid.set(uid, { exceptions: [] });
    const entry = byUid.get(uid)!;
    if (vevent.getFirstProperty('recurrence-id')) {
      entry.exceptions.push(vevent);
    } else {
      entry.master = vevent;
    }
  }

  for (const [uid, { master, exceptions }] of byUid) {
    if (!master) continue;

    const masterEvent = parseMasterVevent(master, url, calendarUrl, uid, etag);
    if (!masterEvent) continue;

    const isRecurring = !!masterEvent.rrule && rangeStart && rangeEnd;

    if (!isRecurring) {
      events.push(masterEvent);
      continue;
    }

    // Expand recurring event occurrences within the requested date range.
    // We use ical.js's built-in iterator which applies the RRULE, EXDATE rules,
    // and automatically substitutes exception VEVENTs for edited occurrences.
    // The 500-occurrence cap prevents runaway expansion on infinite series.
    try {
      const icalEvent = new ICAL.Event(master);
      exceptions.forEach(exc => icalEvent.relateException(new ICAL.Event(exc)));

      const iterStart = ICAL.Time.fromJSDate(rangeStart!, false);
      const iter = icalEvent.iterator(iterStart);
      let next: ICAL.Time | null;
      let count = 0;

      while ((next = iter.next()) !== null && count++ < 500) {
        const occJs = next.toJSDate();
        if (occJs > rangeEnd!) break;

        const details = icalEvent.getOccurrenceDetails(next);
        const occStart = details.startDate;
        const occEnd = details.endDate;
        const occItem = details.item as ICAL.Event;
        const occComp = occItem.component;

        const isAllDay = occStart.isDate;
        const occStartStr = isAllDay ? occStart.toString() : occStart.toJSDate().toISOString();
        const occEndStr = isAllDay ? occEnd.toString() : occEnd.toJSDate().toISOString();

        const occSummary = icalValueToString(occComp.getFirstPropertyValue('summary')) || masterEvent.title;
        const occDescription = icalValueToString(occComp.getFirstPropertyValue('description')) ?? masterEvent.description;
        const occLocation = icalValueToString(occComp.getFirstPropertyValue('location')) ?? masterEvent.location;
        const occReminder = extractReminder(occComp) ?? masterEvent.reminder;

        events.push({
          uid: `${uid}_${occStart.toJSDate().getTime()}`,
          url,
          calendarUrl,
          title: occSummary,
          start: occStartStr,
          end: occEndStr,
          allDay: isAllDay,
          description: occDescription,
          location: occLocation,
          reminder: occReminder,
          etag,
          isOccurrence: true,
          masterUid: uid,
          occurrenceStart: occStartStr,
          masterStart: masterEvent.start,
          masterEnd: masterEvent.end,
          masterAllDay: masterEvent.allDay,
        });
      }
    } catch (err) {
      console.error(`Failed to expand recurring event ${uid}:`, err);
      // Fall back to the master event so it still shows on the calendar
      events.push(masterEvent);
    }
  }

  return events;
}

// ─── Raw CalDAV object helpers ────────────────────────────────────────────────

async function fetchRawObject(url: string, auth: string): Promise<{ data: string; etag: string }> {
  const res = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return { data: await res.text(), etag: res.headers.get('etag') || '' };
}

async function putRawObject(url: string, auth: string, icsData: string, etag?: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Authorization': `Basic ${auth}`,
      ...(etag ? { 'If-Match': etag } : {}),
    },
    body: icsData,
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`PUT ${url} failed: ${res.status} ${res.statusText}`);
  }
}

/** Replace RRULE's UNTIL (and remove COUNT) so the recurrence stops before `untilTime`. */
function truncateRruleUntil(masterVevent: ICAL.Component, untilTime: ICAL.Time): void {
  const rruleProp = masterVevent.getFirstProperty('rrule');
  if (!rruleProp) return;
  const recur = rruleProp.getFirstValue() as ICAL.Recur;
  // Build new RRULE string, stripping COUNT and UNTIL, then adding new UNTIL
  const parts = recur.toString()
    .split(';')
    .filter(p => !p.startsWith('COUNT=') && !p.startsWith('UNTIL='));
  const untilStr = untilTime.isDate
    ? untilTime.toString().replace(/-/g, '')              // "20240314"
    : untilTime.toJSDate().toISOString()
        .replace(/[-:]/g, '').replace('.000', '') + 'Z'; // "20240314T235959Z"
  parts.push(`UNTIL=${untilStr}`);
  rruleProp.setValue(ICAL.Recur.fromString(parts.join(';')));
}

export async function createEvent(username: string, password: string, baseUrl: string, body: CreateEventBody): Promise<CalendarEvent> {
  const client = await createClient(username, password, baseUrl);
  const uid = uuidv4();
  const icalString = buildIcalString({ ...body, uid });

  await client.createCalendarObject({
    calendar: { url: body.calendarUrl },
    filename: `${uid}.ics`,
    iCalString: icalString,
  });

  const objectUrl = `${body.calendarUrl.replace(/\/$/, '')}/${uid}.ics`;
  return {
    uid,
    url: objectUrl,
    calendarUrl: body.calendarUrl,
    title: body.title,
    start: body.start,
    end: body.end,
    allDay: body.allDay || false,
    description: body.description,
    location: body.location,
    rrule: body.rrule,
    reminder: body.reminder,
  };
}

export async function updateEvent(username: string, password: string, baseUrl: string, body: UpdateEventBody): Promise<void> {
  const scope = body.editScope || 'all';
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  if (scope === 'all') {
    // Rebuild the master VEVENT in place (existing behaviour)
    const client = await createClient(username, password, baseUrl);
    const icalString = buildIcalString(body);
    await client.updateCalendarObject({
      calendarObject: { url: body.eventUrl, data: icalString, etag: body.etag },
    });
    return;
  }

  if (scope === 'this') {
    // Add a RECURRENCE-ID exception VEVENT to the master .ics, leaving RRULE intact.
    // CalDAV stores all occurrences of a recurring event in a single .ics file.
    // To override one occurrence, we inject an additional VEVENT with a RECURRENCE-ID
    // matching that occurrence's original start time. Clients and CalDAV servers
    // treat it as a replacement for that specific occurrence only.
    const { data: rawIcs, etag } = await fetchRawObject(body.eventUrl, auth);
    const comp = new ICAL.Component(ICAL.parse(rawIcs));

    const masterVevent = comp.getAllSubcomponents('vevent')
      .find((v: ICAL.Component) => !v.getFirstProperty('recurrence-id'));
    if (!masterVevent) throw new Error('Master VEVENT not found');

    // Remove any pre-existing exception for this occurrence
    comp.getAllSubcomponents('vevent')
      .filter((v: ICAL.Component) => {
        const recId = v.getFirstProperty('recurrence-id');
        if (!recId) return false;
        const t = recId.getFirstValue() as ICAL.Time;
        const iso = t.isDate ? t.toString() : t.toJSDate().toISOString();
        return iso === body.occurrenceStart;
      })
      .forEach((v: ICAL.Component) => comp.removeSubcomponent(v));

    // Build exception VEVENT
    const exVevent = new ICAL.Component('vevent');
    const realUid = body.masterUid || body.uid;
    exVevent.addPropertyWithValue('uid', realUid);

    const isAllDay = body.allDay ?? false;
    if (isAllDay) {
      const recId = ICAL.Time.fromDateString(body.occurrenceStart!.slice(0, 10));
      recId.isDate = true;
      const recProp = new ICAL.Property('recurrence-id');
      recProp.setValue(recId);
      exVevent.addProperty(recProp);
    } else {
      exVevent.addPropertyWithValue(
        'recurrence-id',
        ICAL.Time.fromJSDate(new Date(body.occurrenceStart!), false)
      );
    }

    exVevent.addPropertyWithValue('summary', body.title);
    const now = ICAL.Time.now();
    exVevent.addPropertyWithValue('dtstamp', now);
    exVevent.addPropertyWithValue('last-modified', now);

    if (isAllDay) {
      const s = ICAL.Time.fromDateString(body.start.slice(0, 10)); s.isDate = true;
      const e = ICAL.Time.fromDateString(body.end.slice(0, 10));   e.isDate = true;
      exVevent.addPropertyWithValue('dtstart', s);
      exVevent.addPropertyWithValue('dtend', e);
    } else {
      exVevent.addPropertyWithValue('dtstart', ICAL.Time.fromJSDate(new Date(body.start), false));
      exVevent.addPropertyWithValue('dtend',   ICAL.Time.fromJSDate(new Date(body.end),   false));
    }

    if (body.description) exVevent.addPropertyWithValue('description', body.description);
    if (body.location)    exVevent.addPropertyWithValue('location',    body.location);

    if (body.reminder !== undefined && body.reminder >= 0) {
      const valarm = new ICAL.Component('valarm');
      valarm.addPropertyWithValue('action', 'DISPLAY');
      valarm.addPropertyWithValue('description', 'Reminder');
      valarm.addPropertyWithValue('trigger', ICAL.Duration.fromData({ minutes: -body.reminder }));
      exVevent.addSubcomponent(valarm);
    }

    comp.addSubcomponent(exVevent);
    await putRawObject(body.eventUrl, auth, comp.toString(), etag);
    return;
  }

  if (scope === 'following') {
    // Split the recurring series at this occurrence:
    // 1. Truncate the master RRULE (via UNTIL) so the original series ends just before this occurrence.
    const { data: rawIcs, etag } = await fetchRawObject(body.eventUrl, auth);
    const comp = new ICAL.Component(ICAL.parse(rawIcs));
    const masterVevent = comp.getAllSubcomponents('vevent')
      .find((v: ICAL.Component) => !v.getFirstProperty('recurrence-id'));
    if (!masterVevent) throw new Error('Master VEVENT not found');

    const isAllDay = body.allDay ?? false;
    let untilTime: ICAL.Time;
    if (isAllDay) {
      const occDate = new Date(body.occurrenceStart!.slice(0, 10) + 'T00:00:00');
      occDate.setDate(occDate.getDate() - 1);
      untilTime = ICAL.Time.fromDateString(occDate.toISOString().slice(0, 10));
      untilTime.isDate = true;
    } else {
      const occJs = new Date(body.occurrenceStart!);
      untilTime = ICAL.Time.fromJSDate(new Date(occJs.getTime() - 1000), false);
    }
    truncateRruleUntil(masterVevent, untilTime);
    await putRawObject(body.eventUrl, auth, comp.toString(), etag);

    // 2. Create a brand-new independent event (new UID) from this occurrence onwards,
    //    carrying the edited fields and any RRULE from the request body.
    const client = await createClient(username, password, baseUrl);
    const newUid = uuidv4();
    const newBody = { ...body, uid: newUid };
    const icalString = buildIcalString(newBody);
    await client.createCalendarObject({
      calendar: { url: body.calendarUrl },
      filename: `${newUid}.ics`,
      iCalString: icalString,
    });
  }
}

export async function updateCalendarColor(username: string, password: string, _baseUrl: string, calendarUrl: string, color: string): Promise<void> {
  // Use fetch directly — tsdav's davRequest doesn't reliably send raw XML bodies
  const body = `<?xml version="1.0" encoding="utf-8"?><D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><x1:calendar-color xmlns:x1="http://apple.com/ns/ical/">${color}</x1:calendar-color></D:prop></D:set></D:propertyupdate>`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(calendarUrl, {
    method: 'PROPPATCH',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Authorization': `Basic ${auth}`,
    },
    body,
  });

  if (!res.ok && res.status !== 207) {
    throw new Error(`PROPPATCH failed: ${res.status} ${res.statusText}`);
  }
}

export async function deleteEvent(
  username: string, password: string, baseUrl: string,
  eventUrl: string, etag?: string,
  editScope?: string, occurrenceStart?: string
): Promise<void> {
  const scope = editScope || 'all';
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  if (scope === 'all') {
    const client = await createClient(username, password, baseUrl);
    await client.deleteCalendarObject({ calendarObject: { url: eventUrl, etag } });
    return;
  }

  const { data: rawIcs, etag: currentEtag } = await fetchRawObject(eventUrl, auth);
  const comp = new ICAL.Component(ICAL.parse(rawIcs));
  const masterVevent = comp.getAllSubcomponents('vevent')
    .find((v: ICAL.Component) => !v.getFirstProperty('recurrence-id'));
  if (!masterVevent) throw new Error('Master VEVENT not found');

  const dtstart = masterVevent.getFirstProperty('dtstart');
  const isAllDay = dtstart ? (dtstart.getFirstValue() as ICAL.Time).isDate : false;

  if (scope === 'this') {
    // Add EXDATE so this occurrence is skipped
    let exdateTime: ICAL.Time;
    if (isAllDay) {
      exdateTime = ICAL.Time.fromDateString(occurrenceStart!.slice(0, 10));
      exdateTime.isDate = true;
    } else {
      exdateTime = ICAL.Time.fromJSDate(new Date(occurrenceStart!), false);
    }
    masterVevent.addPropertyWithValue('exdate', exdateTime);
    await putRawObject(eventUrl, auth, comp.toString(), currentEtag);
    return;
  }

  if (scope === 'following') {
    // Truncate RRULE so the series ends just before this occurrence
    let untilTime: ICAL.Time;
    if (isAllDay) {
      const occDate = new Date(occurrenceStart!.slice(0, 10) + 'T00:00:00');
      occDate.setDate(occDate.getDate() - 1);
      untilTime = ICAL.Time.fromDateString(occDate.toISOString().slice(0, 10));
      untilTime.isDate = true;
    } else {
      const occJs = new Date(occurrenceStart!);
      untilTime = ICAL.Time.fromJSDate(new Date(occJs.getTime() - 1000), false);
    }
    truncateRruleUntil(masterVevent, untilTime);
    await putRawObject(eventUrl, auth, comp.toString(), currentEtag);
  }
}

function buildIcalString(event: CreateEventBody & { uid: string; eventUrl?: string; etag?: string }): string {
  const comp = new ICAL.Component(['vcalendar', [], []]);
  comp.addPropertyWithValue('version', '2.0');
  comp.addPropertyWithValue('prodid', '-//Calvora//EN');

  const vevent = new ICAL.Component('vevent');
  vevent.addPropertyWithValue('uid', event.uid);
  vevent.addPropertyWithValue('summary', event.title);

  const now = ICAL.Time.now();
  vevent.addPropertyWithValue('dtstamp', now);
  vevent.addPropertyWithValue('created', now);
  vevent.addPropertyWithValue('last-modified', now);

  if (event.allDay) {
    const startTime = ICAL.Time.fromDateString(event.start.slice(0, 10));
    startTime.isDate = true;
    vevent.addPropertyWithValue('dtstart', startTime);
    const endTime = ICAL.Time.fromDateString(event.end.slice(0, 10));
    endTime.isDate = true;
    vevent.addPropertyWithValue('dtend', endTime);
  } else {
    vevent.addPropertyWithValue('dtstart', ICAL.Time.fromJSDate(new Date(event.start), false));
    vevent.addPropertyWithValue('dtend', ICAL.Time.fromJSDate(new Date(event.end), false));
  }

  if (event.description) vevent.addPropertyWithValue('description', event.description);
  if (event.location) vevent.addPropertyWithValue('location', event.location);
  if (event.rrule) vevent.addPropertyWithValue('rrule', ICAL.Recur.fromString(event.rrule));

  if (event.reminder !== undefined && event.reminder >= 0) {
    const valarm = new ICAL.Component('valarm');
    valarm.addPropertyWithValue('action', 'DISPLAY');
    valarm.addPropertyWithValue('description', 'Reminder');
    valarm.addPropertyWithValue('trigger', ICAL.Duration.fromData({ minutes: -event.reminder }));
    vevent.addSubcomponent(valarm);
  }

  comp.addSubcomponent(vevent);
  return comp.toString();
}

export async function searchEvents(
  username: string,
  password: string,
  baseUrl: string,
  calendarUrls: string[],
  query: string
): Promise<CalendarEvent[]> {
  const q = query.toLowerCase();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);

  const allEvents: CalendarEvent[] = [];
  await Promise.all(
    calendarUrls.map(async (calendarUrl) => {
      try {
        const events = await fetchEvents(username, password, baseUrl, calendarUrl, start, end);
        const filtered = events.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.description?.toLowerCase().includes(q) ||
            e.location?.toLowerCase().includes(q)
        );
        allEvents.push(...filtered);
      } catch {
        // skip failing calendars
      }
    })
  );

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return allEvents.slice(0, 50);
}

// ─── Task (VTODO) functions ───────────────────────────────────────────────────

export async function fetchTasks(
  username: string,
  password: string,
  baseUrl: string,
  calendarUrl: string
): Promise<CalendarTask[]> {
  const client = await createClient(username, password, baseUrl);
  // tsdav defaults to a VEVENT filter — must override with VTODO to get tasks
  const vtodoFilter = [{
    'comp-filter': {
      _attributes: { name: 'VCALENDAR' },
      'comp-filter': { _attributes: { name: 'VTODO' } },
    },
  }];

  const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl },
    filters: vtodoFilter,
  });

  const tasks: CalendarTask[] = [];
  for (const obj of objects) {
    if (!obj.data) continue;
    try {
      const parsed = parseIcalToTasks(obj.data as string, obj.url, calendarUrl, obj.etag);
      tasks.push(...parsed);
    } catch (err) {
      console.error(`Failed to parse task at ${obj.url}:`, err);
    }
  }
  return tasks;
}

function parseIcalToTasks(icalString: string, url: string, calendarUrl: string, etag?: string): CalendarTask[] {
  const jcalData = ICAL.parse(icalString);
  const comp = new ICAL.Component(jcalData);
  const vtodos = comp.getAllSubcomponents('vtodo');
  const tasks: CalendarTask[] = [];

  for (const vtodo of vtodos) {
    const uid = icalValueToString(vtodo.getFirstPropertyValue('uid')) || uuidv4();
    const title = icalValueToString(vtodo.getFirstPropertyValue('summary')) || '(No title)';
    const description = icalValueToString(vtodo.getFirstPropertyValue('description'));
    const statusRaw = icalValueToString(vtodo.getFirstPropertyValue('status'))?.toUpperCase();
    const status = (['NEEDS-ACTION', 'COMPLETED', 'IN-PROCESS', 'CANCELLED'].includes(statusRaw || '')
      ? statusRaw
      : 'NEEDS-ACTION') as CalendarTask['status'];
    const priorityRaw = vtodo.getFirstPropertyValue('priority');
    const priority = typeof priorityRaw === 'number' ? priorityRaw : undefined;

    const dueProp = vtodo.getFirstProperty('dtdue') || vtodo.getFirstProperty('due');
    let due: string | undefined;
    if (dueProp) {
      const dueVal = dueProp.getFirstValue() as ICAL.Time;
      due = dueVal.isDate ? dueVal.toString() : dueVal.toJSDate().toISOString();
    }

    const completedProp = vtodo.getFirstProperty('completed');
    let completed: string | undefined;
    if (completedProp) {
      const completedVal = completedProp.getFirstValue() as ICAL.Time;
      completed = completedVal.toJSDate().toISOString();
    }

    tasks.push({ uid, url, calendarUrl, title, description, due, completed, status, priority, etag });
  }

  return tasks;
}

export async function createTask(
  username: string,
  password: string,
  baseUrl: string,
  body: CreateTaskBody
): Promise<CalendarTask> {
  const client = await createClient(username, password, baseUrl);
  const uid = uuidv4();
  const icalString = buildTaskIcalString({ ...body, uid });

  await client.createCalendarObject({
    calendar: { url: body.calendarUrl },
    filename: `${uid}.ics`,
    iCalString: icalString,
  });

  const objectUrl = `${body.calendarUrl.replace(/\/$/, '')}/${uid}.ics`;
  return {
    uid,
    url: objectUrl,
    calendarUrl: body.calendarUrl,
    title: body.title,
    description: body.description,
    due: body.due,
    status: body.status || 'NEEDS-ACTION',
    priority: body.priority,
  };
}

export async function updateTask(
  username: string,
  password: string,
  baseUrl: string,
  body: UpdateTaskBody
): Promise<void> {
  const client = await createClient(username, password, baseUrl);
  const icalString = buildTaskIcalString(body);

  await client.updateCalendarObject({
    calendarObject: {
      url: body.taskUrl,
      data: icalString,
      etag: body.etag,
    },
  });
}

export async function deleteTask(
  username: string,
  password: string,
  baseUrl: string,
  taskUrl: string,
  etag?: string
): Promise<void> {
  const client = await createClient(username, password, baseUrl);
  await client.deleteCalendarObject({ calendarObject: { url: taskUrl, etag } });
}

function buildTaskIcalString(task: CreateTaskBody & { uid: string; taskUrl?: string; etag?: string; completed?: string }): string {
  const comp = new ICAL.Component(['vcalendar', [], []]);
  comp.addPropertyWithValue('version', '2.0');
  comp.addPropertyWithValue('prodid', '-//Calvora//EN');

  const vtodo = new ICAL.Component('vtodo');
  vtodo.addPropertyWithValue('uid', task.uid);
  vtodo.addPropertyWithValue('summary', task.title);

  const now = ICAL.Time.now();
  vtodo.addPropertyWithValue('dtstamp', now);
  vtodo.addPropertyWithValue('last-modified', now);

  vtodo.addPropertyWithValue('status', task.status || 'NEEDS-ACTION');

  if (task.priority !== undefined) vtodo.addPropertyWithValue('priority', task.priority);
  if (task.description) vtodo.addPropertyWithValue('description', task.description);

  if (task.due) {
    vtodo.addPropertyWithValue('due', ICAL.Time.fromJSDate(new Date(task.due), false));
  }

  if (task.completed) {
    vtodo.addPropertyWithValue('completed', ICAL.Time.fromJSDate(new Date(task.completed), false));
  }

  comp.addSubcomponent(vtodo);
  return comp.toString();
}
