import { PrismaClient, ReceptionHandoverShift } from '@prisma/client';

type SeedTask = { code: string; label: string };

const NIGHT_TASKS: SeedTask[] = [
  { code: 'print_hotel_lists', label: 'Hotel-Listen drucken' },
  { code: 'breakfast', label: 'Frühstück (vorerst)' },
  { code: 'clean_lobby', label: 'Lobby fegen und wischen' },
  { code: 'clean_coffee_machines', label: 'Kaffeemaschinen in Lobby und Lobby-Bar reinigen' },
  { code: 'night_audit', label: 'Night Audit: Tag in Emma umschalten' },
  { code: 'prepare_arrival_check', label: 'Arrival Check vorbereiten' },
  { code: 'prepare_front_office', label: 'Front Office für den Morgendienst vorbereiten' },
  { code: 'key_log', label: 'Schlüsselprotokoll führen und prüfen, dass alle Schlüssel zurückgegeben wurden' },
  { code: 'print_arrival_inhouse', label: 'Anreiseliste und Inhouse-Liste drucken' },
  { code: 'puzzle_requests', label: 'Puzzle-Anfragen beantworten (mindestens 5 pro Person)' },
];

const MORNING_TASKS: SeedTask[] = [
  { code: 'handover_night', label: 'Übergabe von der Nachtschicht' },
  { code: 'checkout_folios', label: 'Check-outs durchführen und prüfen, dass alle Folios bezahlt sind' },
  { code: 'keep_fo_clean', label: 'Front Office und Lobby-Bar sauber halten' },
  { code: 'charge_breakfast_parking', label: 'Frühstück und Parkplatz verrechnen' },
  { code: 'assign_day_use', label: 'Day-Use-Zimmer zuweisen' },
  { code: 'maintain_schedule', label: 'Dienstplan sichtbar halten und an alle Beteiligten weiterleiten' },
  { code: 'assign_future_rooms', label: 'Zimmer für zukünftige Gäste zuweisen' },
  { code: 'bern_ticket_upload', label: 'Eingecheckte Gäste für Bern Ticket hochladen' },
  { code: 'kiosk_stand', label: 'Kiosk-Stand sauber und gefüllt halten' },
  { code: 'puzzle_requests', label: 'Puzzle-Anfragen beantworten (mindestens 5 pro Person)' },
  { code: 'okay_app', label: 'Okay-App auf Gästewünsche prüfen und entsprechend antworten' },
];

const LATE_TASKS: SeedTask[] = [
  { code: 'handover_morning', label: 'Übergabe von der Frühschicht' },
  { code: 'checkin_checkout', label: 'Gäste einchecken und auschecken' },
  { code: 'keep_fo_tidy', label: 'Front Office sauber und ordentlich halten' },
  { code: 'assign_all_rooms', label: 'Allen Gästen Zimmer zuweisen' },
  { code: 'print_final_lists', label: 'Finale Anreiseliste und Inhouse-Liste drucken' },
  { code: 'coffee_station', label: 'Kaffeestation auffüllen und reinigen' },
  { code: 'water_station', label: 'Wasserstation auffüllen und reinigen' },
  { code: 'smoking_area', label: 'Raucherbereich sauber halten' },
  { code: 'reply_emails', label: 'Alle E-Mails beantworten' },
  { code: 'puzzle_requests', label: 'Puzzle-Anfragen beantworten (mindestens 5 pro Person)' },
  { code: 'okay_app', label: 'Okay-App auf Gästewünsche prüfen und entsprechend antworten' },
];

const SHIFT_TASKS: Record<ReceptionHandoverShift, SeedTask[]> = {
  NIGHT: NIGHT_TASKS,
  MORNING: MORNING_TASKS,
  LATE: LATE_TASKS,
};

export async function seedShiftHandover(prisma: PrismaClient) {
  for (const shift of Object.keys(SHIFT_TASKS) as ReceptionHandoverShift[]) {
    const tasks = SHIFT_TASKS[shift];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await prisma.shiftHandoverTemplateTask.upsert({
        where: { shift_code: { shift, code: t.code } },
        create: { shift, code: t.code, label: t.label, sortOrder: i },
        update: { label: t.label, sortOrder: i },
      });
    }
  }

  await prisma.shiftHandoverState.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', activeShift: ReceptionHandoverShift.NIGHT, completions: {} },
    update: {},
  });
}
