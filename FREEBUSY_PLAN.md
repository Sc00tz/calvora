# Free/Busy & Availability — Implementation Plan (#7)

## What CalDAV actually offers (investigation findings)

`tsdav@2.1.8` (already a dependency) exposes the relevant primitives:

- **`freeBusyQuery({ url, timeRange })`** — issues a `free-busy-query` REPORT against a
  **calendar collection**. This answers *"when is the owner of THIS calendar busy?"* It
  works cleanly for the **logged-in user's own calendars** (we already have their URLs).
- **`fetchCalendarUserAddresses`** + principal props (`calendar-user-address-set`,
  `principalUrl`, `homeUrl`) — used to resolve a person to their CalDAV principal.
- **Scheduling Outbox (RFC 6638)** — the "proper" way to ask *"when is this OTHER person
  busy?"* is to POST a `VFREEBUSY` REQUEST to the user's **schedule-outbox**. tsdav does
  **not** wrap this; we'd hand-build it via `davRequest`.

## The hard constraint (must communicate to the user)

Free/busy for **other people** only works when:
1. The guest is a **user on the same Davis server** (external gmail/etc. addresses have no
   queryable free/busy — there's nothing to ask).
2. Davis/SabreDAV has the **scheduling plugin enabled** and permits cross-principal
   free/busy lookups for the authenticated user. This is **unverified against the user's
   Davis instance** and may require server config. SabreDAV supports it, but Davis-standalone's
   default enablement is unknown — needs a live probe.

So realistic scope: **strong for "my own availability,"** best-effort/uncertain for other
same-server users, **impossible for external guests.**

## Proposed scope (phased, smallest-useful-first)

### Phase 1 — "My availability" overlay (high confidence, no new server assumptions)
- Backend: `getFreeBusy(username, password, baseUrl, calendarUrls, start, end)` using
  `client.freeBusyQuery` over the user's own calendars; parse the returned `VFREEBUSY`
  into busy intervals `[{start, end}]`.
- Route: `GET /api/freebusy?start=…&end=…` (own busy blocks).
- This already powers a useful feature: when creating an event, show the user their own
  conflicts. Low risk, fully within current capabilities.

### Phase 2 — Same-server guest availability (medium confidence, needs live probe)
- Resolve each attendee email → principal via `calendar-user-address-set`.
- POST a `VFREEBUSY` REQUEST to the user's schedule-outbox via `davRequest`.
- Parse per-attendee busy blocks. Gracefully mark unresolvable/external guests as
  "availability unknown."
- **Gate:** verify Davis honors outbox free/busy before building the UI on it.

### Phase 3 — Availability UI
- A side-by-side time grid in (or launched from) the event editor: rows = you + each
  resolvable guest, columns = the time range, busy blocks shaded. External/unknown guests
  shown greyed with an "unknown" label.

## Open questions for the user
1. Are the guests you'd schedule with **users on your Davis server**, or mostly external?
   (Determines whether Phase 2/3 are worth it at all.)
2. OK to **probe your live Davis** for outbox/free-busy support before committing to Phase 2?
3. Is **Phase 1 alone** (your own conflicts) enough for now, or is multi-person the point?

## Risk notes
- Phase 1: low risk, builds on a method we already have.
- Phase 2: real risk of hitting a Davis limitation mid-build — hence the probe-first gate.
- No changes to existing event read/write paths; this is additive (new route + new UI).
