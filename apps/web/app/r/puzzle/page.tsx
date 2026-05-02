'use client';

import { Card } from '@/components/ui/Card';

export default function ReceptionPuzzlePage() {
  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Puzzle</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Verwaltung und Übersicht aller Puzzle.
        </p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-ink-muted">
          Dieser Bereich ist noch leer. Hier wird in Kürze die Puzzle-Verwaltung
          eingebaut.
        </p>
      </Card>
    </div>
  );
}
