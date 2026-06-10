import { extractFolioChargesFromDetailsHeader } from '../packages/shared/dist/folio-charges.js';

// Simulates room charges routed to company folio 02; originals marked StatusCharge 02.
const headers = [
  {
    Id: '000001',
    Concept: 'BB',
    Folio: '01',
    StatusCharge: '02',
    Amount: '190.32',
    ProductionDate: '/Date(1780704000000)/',
  },
  {
    Id: '000002',
    Concept: 'CTAX2',
    Folio: '01',
    StatusCharge: '02',
    Amount: '1.04',
    ProductionDate: '/Date(1780704000000)/',
  },
  {
    Id: '000017',
    Concept: 'BB',
    Folio: '02',
    StatusCharge: '01',
    Amount: '190.32',
    ProductionDate: '/Date(1780704000000)/',
  },
  {
    Id: '000018',
    Concept: 'CTAX2',
    Folio: '02',
    StatusCharge: '01',
    Amount: '1.04',
    ProductionDate: '/Date(1780704000000)/',
  },
  {
    Id: '000019',
    Concept: 'PPWO',
    Folio: '02',
    StatusCharge: '01',
    Amount: '-191.36',
    ProductionDate: '/Date(1780704000000)/',
  },
];

const charges = extractFolioChargesFromDetailsHeader(headers);
const byFolio = Object.groupBy(charges, (c) => c.folioId ?? '?');
console.log('Folio 01:', (byFolio['01'] ?? []).map((c) => c.id + ' ' + c.concept));
console.log('Folio 02:', (byFolio['02'] ?? []).map((c) => c.id + ' ' + c.concept));

if ((byFolio['01'] ?? []).length !== 0) throw new Error('Folio 01 should have no visible charges');
if ((byFolio['02'] ?? []).length !== 3) throw new Error('Folio 02 should have 3 charges');
console.log('OK');
