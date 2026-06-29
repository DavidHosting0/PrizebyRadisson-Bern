# Mirus NEO DOM selectors (shift page)

Source: CSS from `neo.mirus.ch` (`mirus.*.css`) and HAR analysis.
Live DOM may vary; scraper tries multiple strategies in order.

## URL pattern

- Day view: `https://neo.mirus.ch/webapp/shifts/shift/YYYY-MM-DD`
- Date is taken from the path segment after `/shift/`.

## Primary grid (absence / team plan layout)

Used when Mirus renders the team grid (shared CSS with absence planning):

| Role | Selector |
|------|----------|
| Table container | `.absenceplan-table` |
| Data row | `.absenceplan-table-row` |
| Employee name (sticky column) | `.absenceplan-sticky-column`, `.absenceplan-team-member` |
| Team header row | `.absenceplan-team-row`, `.absenceplan-team-name` |
| Cell data | `.absenceplan-cell`, `.absenceplan-data-cell` |
| Shift/absence pill | `.absence-plan-data-point` |

Skip team header rows and absence-only pills when text matches absence keywords.

## Week calendar header (navigation)

| Role | Selector |
|------|----------|
| Week strip | `.weekCalendarTable`, `.weekCalendarTableContainer` |
| Day column height | `.calendar-line` |

## Telerik Scheduler (fallback)

| Role | Selector |
|------|----------|
| Scheduler root | `.k-scheduler`, `[class*="k-scheduler"]` |
| Event block | `.k-event`, `.k-scheduler-event` |

## MudBlazor table (fallback)

| Role | Selector |
|------|----------|
| Table body rows | `.mud-table-body tr`, `table.mud-table tbody tr` |

## Time / absence heuristics

- Shift time: `\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}`
- Absence keywords (skip): `urlaub`, `krank`, `absence`, `ferien`, `abwesen`, `feiertag`, `frei`

## User ID

No stable Mirus person ID in DOM — use normalized display name as `favurUserId` (lowercase, collapsed whitespace).
