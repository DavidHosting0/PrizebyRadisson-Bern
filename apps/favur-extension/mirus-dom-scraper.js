/*
 * Content script for neo.mirus.ch — scrapes rendered shift data from the DOM
 * after Blazor finishes rendering (SignalR/WebSocket; not capturable via fetch).
 */
(() => {
  const TAG = '[Mirus-Sync]';
  const ABSENCE_RE =
    /\b(urlaub|krank|absence|ferien|abwesen|feiertag|frei|krankheit|mutterschaft|vaterschaft)\b/i;
  const TIME_RANGE_RE = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;
  const TIME_SINGLE_RE = /\b(\d{1,2}:\d{2})\b/g;

  function parseDateFromUrl() {
    const m = /\/webapp\/shifts\/shift\/(\d{4}-\d{2}-\d{2})/i.exec(location.pathname);
    return m ? m[1] : null;
  }

  function normalizeUserId(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function combineDateTime(dateStr, timeStr) {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const tm = /^(\d{1,2}):(\d{2})/.exec(timeStr);
    if (!dm || !tm) return null;
    const d = new Date(
      Number(dm[1]),
      Number(dm[2]) - 1,
      Number(dm[3]),
      Number(tm[1]),
      Number(tm[2]),
      0,
      0,
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function shiftKey(row) {
    return `${row.displayName}|${row.startsAt}|${row.endsAt}`;
  }

  function addShift(out, seen, row) {
    if (!row.displayName || !row.startsAt || !row.endsAt) return;
    const key = shiftKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  }

  function parseTimeRangeInText(text, dateStr) {
    const m = TIME_RANGE_RE.exec(text);
    if (!m) return null;
    const startsAt = combineDateTime(dateStr, m[1]);
    let endsAt = combineDateTime(dateStr, m[2]);
    if (!startsAt || !endsAt) return null;
    if (new Date(endsAt) <= new Date(startsAt)) {
      const end = new Date(endsAt);
      end.setDate(end.getDate() + 1);
      endsAt = end.toISOString();
    }
    const label = text.replace(TIME_RANGE_RE, '').trim() || null;
    return { startsAt, endsAt, label: label || null };
  }

  function scrapeAbsencePlanGrid(dateStr) {
    const out = [];
    const seen = new Set();
    const table = document.querySelector('.absenceplan-table');
    if (!table) return out;

    const rows = table.querySelectorAll('.absenceplan-table-row');
    for (const row of rows) {
      if (row.classList.contains('absenceplan-team-row')) continue;

      const nameEl =
        row.querySelector('.absenceplan-team-member') ||
        row.querySelector('.absenceplan-sticky-column');
      const displayName = nameEl?.textContent?.trim();
      if (!displayName || displayName.length < 2) continue;

      const cells = row.querySelectorAll(
        '.absenceplan-cell, .absenceplan-data-cell, .absence-plan-data-point',
      );
      for (const cell of cells) {
        const text = cell.textContent?.trim() ?? '';
        if (!text || ABSENCE_RE.test(text)) continue;

        const parsed = parseTimeRangeInText(text, dateStr);
        if (parsed) {
          addShift(out, seen, {
            displayName,
            favurUserId: normalizeUserId(displayName),
            startsAt: parsed.startsAt,
            endsAt: parsed.endsAt,
            label: parsed.label,
            sourceId: `${normalizeUserId(displayName)}-${parsed.startsAt}`,
          });
        }
      }
    }
    return out;
  }

  function scrapeKendoScheduler(dateStr) {
    const out = [];
    const seen = new Set();
    const events = document.querySelectorAll('.k-event, .k-scheduler-event, [class*="k-event"]');
    for (const ev of events) {
      const title =
        ev.querySelector('.k-event-title')?.textContent?.trim() ||
        ev.getAttribute('title')?.trim() ||
        ev.textContent?.trim();
      if (!title || ABSENCE_RE.test(title)) continue;

      const timeText =
        ev.querySelector('.k-event-time')?.textContent?.trim() || title;
      const parsed = parseTimeRangeInText(timeText, dateStr);
      if (!parsed) continue;

      const displayName =
        ev.getAttribute('data-person')?.trim() ||
        ev.closest('[data-person]')?.getAttribute('data-person')?.trim() ||
        title.split(/\d{1,2}:\d{2}/)[0]?.trim();
      if (!displayName) continue;

      addShift(out, seen, {
        displayName,
        favurUserId: normalizeUserId(displayName),
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        label: parsed.label,
        sourceId: ev.getAttribute('data-id') || `${normalizeUserId(displayName)}-${parsed.startsAt}`,
      });
    }
    return out;
  }

  function scrapeGenericTables(dateStr) {
    const out = [];
    const seen = new Set();

    const rowSelectors = [
      '.mud-table-body tr',
      'table.mud-table tbody tr',
      '.calendar-line',
      'tr',
    ];

    for (const sel of rowSelectors) {
      const rows = document.querySelectorAll(sel);
      if (rows.length < 2) continue;

      for (const row of rows) {
        const cells = [...row.querySelectorAll('td, th, div, span')].filter(
          (el) => el.children.length === 0 || el.classList.contains('absence-plan-data-point'),
        );
        if (cells.length < 2) continue;

        let displayName = null;
        let timeCell = null;
        for (const cell of cells) {
          const text = cell.textContent?.trim() ?? '';
          if (!text) continue;
          if (TIME_RANGE_RE.test(text)) {
            timeCell = text;
          } else if (
            !displayName &&
            text.length >= 2 &&
            text.length <= 80 &&
            !/^\d+$/.test(text) &&
            !TIME_RANGE_RE.test(text)
          ) {
            displayName = text;
          }
        }
        if (!displayName || !timeCell || ABSENCE_RE.test(timeCell)) continue;

        const parsed = parseTimeRangeInText(timeCell, dateStr);
        if (!parsed) continue;

        addShift(out, seen, {
          displayName,
          favurUserId: normalizeUserId(displayName),
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          label: parsed.label,
          sourceId: `${normalizeUserId(displayName)}-${parsed.startsAt}`,
        });
      }

      if (out.length > 0) break;
    }
    return out;
  }

  function scrapeShifts() {
    const dateStr = parseDateFromUrl();
    if (!dateStr) return { date: null, shifts: [], error: 'not a shift page' };

    const strategies = [scrapeAbsencePlanGrid, scrapeKendoScheduler, scrapeGenericTables];
    let shifts = [];
    for (const fn of strategies) {
      shifts = fn(dateStr);
      if (shifts.length > 0) break;
    }
    return { date: dateStr, shifts };
  }

  function waitForContent(timeoutMs = 25000) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        const hasGrid =
          document.querySelector('.absenceplan-table') ||
          document.querySelector('.k-scheduler') ||
          document.querySelector('.mud-table') ||
          document.querySelector('.calendar-line') ||
          document.body.textContent.match(TIME_RANGE_RE);
        if (hasGrid) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  async function runScrape(trigger) {
    if (!/\/webapp\/shifts\/shift\//i.test(location.pathname)) return;

    const ready = await waitForContent();
    if (!ready) {
      console.warn(TAG, 'timed out waiting for shift content');
    }
    // Blazor may render in waves — short extra delay
    await new Promise((r) => setTimeout(r, 1500));

    const result = scrapeShifts();
    if (result.shifts.length === 0) {
      console.warn(TAG, 'no shifts found on', location.pathname);
    } else {
      console.log(TAG, `scraped ${result.shifts.length} shifts for ${result.date}`);
    }

    chrome.runtime.sendMessage({
      type: 'MIRUS_DOM_SCRAPE',
      payload: {
        ...result,
        pageUrl: location.href,
        trigger: trigger ?? 'auto',
        capturedFrom: navigator.userAgent.slice(0, 150),
      },
    });
  }

  // Auto-scrape on shift pages
  if (/\/webapp\/shifts\/shift\//i.test(location.pathname)) {
    if (document.readyState === 'complete') {
      runScrape('auto');
    } else {
      window.addEventListener('load', () => runScrape('auto'));
    }

    // Re-scrape when Blazor updates the DOM
    let debounce;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => runScrape('mutation'), 3000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Background date-loop requests a scrape on this tab
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SCRAPE_NOW') {
      runScrape('manual').then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  console.log(TAG, 'mirus dom scraper ready');
})();
