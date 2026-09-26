import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCsv(hotelKey: string, from?: Date, to?: Date): Promise<string> {
    const rows = await this.prisma.guestReview.findMany({
      where: {
        hotelKey,
        ...(from || to
          ? { reviewedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { analysis: true },
      orderBy: { reviewedAt: 'desc' },
      take: 10_000,
    });
    const header = [
      'id',
      'externalId',
      'reviewedAt',
      'score',
      'sentiment',
      'sentimentScore',
      'language',
      'guestCountry',
      'travelType',
      'summaryEn',
      'fullText',
    ];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.externalId,
          r.reviewedAt.toISOString(),
          r.score,
          r.analysis?.sentiment ?? '',
          r.analysis?.sentimentScore ?? '',
          r.language ?? '',
          r.guestCountry ?? '',
          r.travelType ?? '',
          r.analysis?.summaryEn ?? '',
          r.fullText,
        ]
          .map(esc)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  /** Minimal XLSX (SpreadsheetML) without extra deps. */
  async exportXlsx(hotelKey: string, from?: Date, to?: Date): Promise<Buffer> {
    const csv = await this.exportCsv(hotelKey, from, to);
    const rows = csv.split('\n').map((line) => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur);
          cur = '';
        } else cur += ch;
      }
      cells.push(cur);
      return cells;
    });
    const sheetRows = rows
      .map(
        (cols) =>
          `<row>${cols
            .map((c) => `<cell><data ss:Type="String">${escapeXml(c)}</data></cell>`)
            .join('')}</row>`,
      )
      .join('');
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Reviews"><Table>${sheetRows}</Table></Worksheet>
</Workbook>`;
    return Buffer.from(xml, 'utf8');
  }

  async exportPdf(hotelKey: string, title: string, summaryEn: string): Promise<Buffer> {
    // Minimal PDF (single page text) without pdfkit dependency
    const lines = wrapText(`${title}\n\n${summaryEn}`, 80);
    const contentLines = lines
      .map((l, i) => `BT /F1 11 Tf 50 ${750 - i * 14} Td (${escapePdf(l)}) Tj ET`)
      .join('\n');
    const objects: string[] = [];
    objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
    objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
    objects.push(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    );
    objects.push(`4 0 obj<< /Length ${Buffer.byteLength(contentLines)} >>stream\n${contentLines}\nendstream\nendobj`);
    objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += obj + '\n';
    }
    const xrefStart = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapePdf(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > width) {
        if (line) out.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    out.push(line || ' ');
  }
  return out.slice(0, 48);
}
