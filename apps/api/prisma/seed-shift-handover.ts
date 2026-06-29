import { PrismaClient, ReceptionHandoverShift } from '@prisma/client';

type SeedTask = { code: string; label: string; essential: boolean };

const NIGHT_TASKS: SeedTask[] = [
  {
    code: 'print_hotel_lists',
    label: 'Hotel-Listen drucken (Inhouse, Anreisen, Abreisen)',
    essential: true,
  },
  {
    code: 'breakfast',
    label: 'Frühstück vorbereiten / kontrollieren',
    essential: false,
  },
  {
    code: 'clean_lobby',
    label: 'Lobby fegen und wischen',
    essential: false,
  },
  {
    code: 'clean_coffee_machines',
    label: 'Kaffeemaschinen reinigen (Lobby + Lobby-Bar)',
    essential: false,
  },
  {
    code: 'night_audit',
    label: 'Night Audit: Geschäftstag in Emma umschalten',
    essential: true,
  },
  {
    code: 'prepare_arrival_check',
    label: 'Arrival Check vorbereiten',
    essential: true,
  },
  {
    code: 'prepare_front_office',
    label: 'Front Office für den Frühdienst vorbereiten',
    essential: true,
  },
  {
    code: 'key_log',
    label: 'Schlüsselprotokoll führen — alle Schlüssel zurück?',
    essential: true,
  },
  {
    code: 'print_arrival_inhouse',
    label: 'Anreise- und Inhouse-Liste drucken',
    essential: true,
  },
  {
    code: 'puzzle_requests',
    label: 'Puzzle: mind. 5 Anfragen pro Person beantworten',
    essential: false,
  },
];

const MORNING_TASKS: SeedTask[] = [
  {
    code: 'handover_night',
    label: 'Übergabe Nachtschicht entgegennehmen',
    essential: true,
  },
  {
    code: 'checkout_folios',
    label: 'Check-outs durchführen — alle Folios bezahlt?',
    essential: true,
  },
  {
    code: 'keep_fo_clean',
    label: 'Front Office und Lobby-Bar sauber halten',
    essential: false,
  },
  {
    code: 'charge_breakfast_parking',
    label: 'Frühstück und Parkplatz verrechnen',
    essential: true,
  },
  {
    code: 'assign_day_use',
    label: 'Day-Use-Zimmer zuweisen',
    essential: false,
  },
  {
    code: 'maintain_schedule',
    label: 'Dienstplan sichtbar halten und an alle Beteiligten weiterleiten',
    essential: true,
  },
  {
    code: 'assign_future_rooms',
    label: 'Zimmer für Folgetage zuweisen',
    essential: true,
  },
  {
    code: 'bern_ticket_upload',
    label: 'Eingecheckte Gäste für Bern Ticket hochladen',
    essential: false,
  },
  {
    code: 'kiosk_stand',
    label: 'Kiosk sauber und gefüllt halten',
    essential: false,
  },
  {
    code: 'puzzle_requests',
    label: 'Puzzle: mind. 5 Anfragen pro Person beantworten',
    essential: false,
  },
  {
    code: 'okay_app',
    label: 'Okay-App: Gästewünsche prüfen und beantworten',
    essential: true,
  },
];

const LATE_TASKS: SeedTask[] = [
  {
    code: 'handover_morning',
    label: 'Übergabe Frühschicht entgegennehmen',
    essential: true,
  },
  {
    code: 'checkin_checkout',
    label: 'Check-in und Check-out durchführen',
    essential: true,
  },
  {
    code: 'keep_fo_tidy',
    label: 'Front Office sauber und ordentlich halten',
    essential: false,
  },
  {
    code: 'assign_all_rooms',
    label: 'Allen Gästen Zimmer zuweisen',
    essential: true,
  },
  {
    code: 'print_final_lists',
    label: 'Finale Anreise- und Inhouse-Liste drucken',
    essential: true,
  },
  {
    code: 'coffee_station',
    label: 'Kaffeestation auffüllen und reinigen',
    essential: false,
  },
  {
    code: 'water_station',
    label: 'Wasserstation auffüllen und reinigen',
    essential: false,
  },
  {
    code: 'smoking_area',
    label: 'Raucherbereich sauber halten',
    essential: false,
  },
  {
    code: 'reply_emails',
    label: 'E-Mails beantworten',
    essential: true,
  },
  {
    code: 'puzzle_requests',
    label: 'Puzzle: mind. 5 Anfragen pro Person beantworten',
    essential: false,
  },
  {
    code: 'okay_app',
    label: 'Okay-App: Gästewünsche prüfen und beantworten',
    essential: true,
  },
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
        create: {
          shift,
          code: t.code,
          label: t.label,
          sortOrder: i,
          essential: t.essential,
        },
        update: { label: t.label, sortOrder: i, essential: t.essential },
      });
    }
  }

  await prisma.shiftHandoverState.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', activeShift: ReceptionHandoverShift.NIGHT, completions: {} },
    update: {},
  });
}
