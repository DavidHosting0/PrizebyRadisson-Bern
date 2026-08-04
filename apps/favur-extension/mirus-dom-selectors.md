# Mirus NEO DOM selectors (Dienstplan)

Confirmed live against `https://neo.mirus.ch/webapp/shifts/shift` (Aug 2026).

## URL pattern

- Day view: `https://neo.mirus.ch/webapp/shifts/shift/YYYY-MM-DD`
- Base (today): `https://neo.mirus.ch/webapp/shifts/shift`

## Interaction (required)

The first paint is a **compact avatar strip** (initials / photos). Shift times are **not** visible until the day detail list is opened:

1. Wait for `.team-color-container`
2. Click the first `.team-color-container`
3. Wait until body text contains `Arbeitszeit` + a time range

## Expanded day list

| Role | Selector / text |
|------|-----------------|
| Person row | `.card.card-default .row.mb-3` |
| Full name | `.small.fw-bold` / `.fw-bold` |
| Cost-center / shift badge | `.badge` (e.g. `K1`, `H`, `F1`) |
| Work time label | text `Arbeitszeit` |
| Work time value | sibling `.col-6` → `HH:MM - HH:MM` |
| Break | text `Pause` (ignored for roster) |
| Person photo / id | `img[src*="/Persons/{uuid}/"]` `alt` = full name |
| Section present | heading `Anwesend` |
| Section absent | heading `Abwesend` (no `Arbeitszeit` → skip) |

## Time handling

- Pattern: `\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}`
- Overnight shifts (`22:00 - 07:00`): end date = start date + 1 day
- Absences (`Absenz`, `Ferien`) without `Arbeitszeit` are skipped

## User ID

Prefer Person UUID from thumbnail URL `/file/documents/thumbnails/.../Persons/{uuid}/...`.
Fallback: normalized display name (lowercase, collapsed whitespace).

## Note on browser HARs

Chrome often exports only thumbnail image requests for this page (WebSocket / Blazor frames omitted). The authoritative UI flow is login → `/webapp/shifts/shift/{date}` → click avatar → scrape `Arbeitszeit` cards.
