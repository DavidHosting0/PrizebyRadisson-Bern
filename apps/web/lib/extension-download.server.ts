import fs from 'fs';
import path from 'path';

export function resolveExtensionZipPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'downloads', 'prize-panel-extension.zip'),
    path.join(cwd, 'apps', 'web', 'public', 'downloads', 'prize-panel-extension.zip'),
    path.join(cwd, '..', 'web', 'public', 'downloads', 'prize-panel-extension.zip'),
    path.join(cwd, '..', '..', 'apps', 'web', 'public', 'downloads', 'prize-panel-extension.zip'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
