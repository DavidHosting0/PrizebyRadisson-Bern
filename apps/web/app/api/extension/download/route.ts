import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { resolveExtensionZipPath } from '@/lib/extension-download.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const zipPath = resolveExtensionZipPath();
  if (!zipPath) {
    return NextResponse.json(
      {
        message:
          'Extension package not found on server. Run npm run build:extension (or full npm run build) on the server.',
      },
      { status: 404 },
    );
  }

  const buffer = await readFile(zipPath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="prize-panel-extension.zip"',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
