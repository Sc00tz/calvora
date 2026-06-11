// SPDX-License-Identifier: GPL-3.0-or-later
import ICAL from 'ical.js';
import { getVtimezoneComponent, timezoneExists } from '@touch4it/ical-timezones';

// Registers an IANA timezone with ical.js's TimezoneService (once) and returns its
// VTIMEZONE component so callers can embed it in the VCALENDAR. Returns null for
// unknown/invalid zone names, letting callers fall back to UTC instants.
//
// Conversions here are independent of the server's local TZ — the VTIMEZONE carries
// the DST rules — which is the whole point: event wall-clock times must not depend on
// whatever timezone the Calvora container happens to run in.

const registered = new Set<string>();

export function getTimezone(tzid: string): ICAL.Timezone | null {
  if (!tzid || !timezoneExists(tzid)) return null;
  const tz = ICAL.TimezoneService.get(tzid);
  if (tz) return tz;
  const vtzStr = getVtimezoneComponent(tzid);
  if (!vtzStr) return null;
  const component = new ICAL.Component(ICAL.parse(vtzStr));
  const zone = new ICAL.Timezone({ component, tzid });
  ICAL.TimezoneService.register(zone);
  registered.add(tzid);
  return zone;
}

export function getVtimezoneText(tzid: string): string | null {
  if (!tzid || !timezoneExists(tzid)) return null;
  return getVtimezoneComponent(tzid) || null;
}

// Converts a UTC instant (ISO string) to an ICAL.Time anchored in the given zone.
// Returns null if the zone is unknown so callers can fall back to plain UTC.
export function utcIsoToZonedTime(utcIso: string, tzid: string): ICAL.Time | null {
  const tz = getTimezone(tzid);
  if (!tz) return null;
  const utc = ICAL.Time.fromJSDate(new Date(utcIso), true);
  return utc.convertToZone(tz);
}
