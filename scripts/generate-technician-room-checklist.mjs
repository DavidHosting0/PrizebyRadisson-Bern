/**
 * Print-optimized PDF checklist: rooms grouped by floor, empty checkboxes.
 * No logo (insert separately if needed). Usage:
 *   node scripts/generate-technician-room-checklist.mjs [outPath]
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allHotelRoomNumbers,
  floorFromRoomNumber,
  compareRoomNumbers,
} from '../packages/shared/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || '.',
    'Desktop',
    'Zimmer-Leer-Checkliste-Techniker.pdf',
  );

/** @returns {[number, string[]][]} */
function roomsByFloor() {
  /** @type {Map<number, string[]>} */
  const map = new Map();
  for (const room of allHotelRoomNumbers()) {
    const floor = floorFromRoomNumber(room);
    if (floor == null) continue;
    if (!map.has(floor)) map.set(floor, []);
    map.get(floor).push(room);
  }
  for (const rooms of map.values()) rooms.sort(compareRoomNumbers);
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function floorTitle(floor) {
  if (floor === -1) return 'Stockwerk -1';
  return `Stockwerk ${floor}`;
}

function drawCheckbox(doc, x, y, size = 9) {
  doc.lineWidth(1).strokeColor('#222222').rect(x, y, size, size).stroke();
}

async function build() {
  const floors = roomsByFloor();
  const totalRooms = floors.reduce((n, [, r]) => n + r.length, 0);

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    // Extra bottom margin so content never sits in the footer band
    margins: { top: 36, bottom: 48, left: 36, right: 36 },
    info: {
      Title: 'Zimmer leer – Checkliste Techniker',
      Author: 'Housekeeping',
    },
  });

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageWidth - doc.page.margins.right;
  const contentWidth = right - left;
  const bottomLimit = pageHeight - doc.page.margins.bottom;

  // —— Header: date only (no logo) ——
  let y = doc.page.margins.top;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#222222');
  doc.text('Datum:', left, y, { lineBreak: false });
  doc
    .moveTo(left + 42, y + 11)
    .lineTo(right, y + 11)
    .strokeColor('#333333')
    .lineWidth(0.8)
    .stroke();

  y += 28;

  const cols = 6;
  const gapX = 8;
  const gapY = 6;
  const cellW = (contentWidth - gapX * (cols - 1)) / cols;
  const cellH = 18;
  const boxSize = 9;
  const sectionGap = 10;
  const headerH = 18;

  function ensureSpace(needed) {
    if (y + needed <= bottomLimit) return;
    doc.addPage();
    y = doc.page.margins.top;
  }

  for (const [floor, rooms] of floors) {
    ensureSpace(headerH + cellH + sectionGap);

    doc.rect(left, y, contentWidth, headerH).fill('#1F4E79');
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`${floorTitle(floor)}   ·   ${rooms.length} Zimmer`, left + 8, y + 4, {
        width: contentWidth - 16,
        lineBreak: false,
      });
    y += headerH + 6;

    for (let i = 0; i < rooms.length; i++) {
      const col = i % cols;
      if (col === 0) {
        ensureSpace(cellH + gapY);
      }

      const x = left + col * (cellW + gapX);
      const room = rooms[i];

      doc.rect(x, y, cellW, cellH).fillAndStroke('#F7F9FC', '#D0D7DE');

      const boxX = x + 5;
      const boxY = y + (cellH - boxSize) / 2;
      drawCheckbox(doc, boxX, boxY, boxSize);

      doc
        .fillColor('#111111')
        .font('Helvetica')
        .fontSize(10)
        .text(room, boxX + boxSize + 5, y + 4, {
          width: cellW - boxSize - 12,
          lineBreak: false,
        });

      if (col === cols - 1 || i === rooms.length - 1) {
        y += cellH + gapY;
      }
    }

    y += sectionGap;
  }

  // Stamp page numbers without letting PDFKit auto-create extra pages
  // (doc.text() after the content cursor can overflow → blank "Seite x/y" pages).
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#888888')
      .text(`Seite ${i + 1} / ${range.count}`, left, pageHeight - 32, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`Wrote ${totalRooms} rooms → ${outPath}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
