export const BT_API_BASE = 'https://bernticket.com/api';
export const BERN_TICKET_2FA_REQUIRED = 'BERN_TICKET_2FA_REQUIRED';

export type BtTicketCreateBody = {
  guestName: string;
  bookingNumber?: string;
  otaNumber?: string;
  validFrom: string;
  validTo: string;
  ticketsAmount?: number;
};

export type BtTicket = {
  id: string;
  guestName: string;
  bookingNumber?: string | null;
  otaNumber?: string | null;
  validFrom: string;
  validTo: string;
  ticketsAmount: number;
  status: string;
  platformState?: string | null;
  externalId?: string | null;
  rawData?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export class BtApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'BtApiError';
    this.status = status;
    this.code = code;
  }
}
