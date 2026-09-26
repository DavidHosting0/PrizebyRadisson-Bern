/** System topic taxonomy for Review Analyzer (slug + category + display name). */
export type ReviewTopicDef = { slug: string; name: string; category: string };

export const REVIEW_TOPIC_TAXONOMY: ReviewTopicDef[] = [
  // Room
  { slug: 'room-cleanliness', name: 'Room cleanliness', category: 'Room' },
  { slug: 'room-size', name: 'Room size', category: 'Room' },
  { slug: 'bed', name: 'Bed', category: 'Room' },
  { slug: 'mattress', name: 'Mattress', category: 'Room' },
  { slug: 'pillows', name: 'Pillows', category: 'Room' },
  { slug: 'bathroom', name: 'Bathroom', category: 'Room' },
  { slug: 'shower', name: 'Shower', category: 'Room' },
  { slug: 'toilet', name: 'Toilet', category: 'Room' },
  { slug: 'room-amenities', name: 'Room amenities', category: 'Room' },
  { slug: 'furniture', name: 'Furniture', category: 'Room' },
  { slug: 'lighting', name: 'Lighting', category: 'Room' },
  { slug: 'power-outlets', name: 'Power outlets', category: 'Room' },
  { slug: 'air-conditioning', name: 'Air conditioning', category: 'Room' },
  { slug: 'heating', name: 'Heating', category: 'Room' },
  { slug: 'noise', name: 'Noise', category: 'Room' },
  // Hotel
  { slug: 'hotel-cleanliness', name: 'Hotel cleanliness', category: 'Hotel' },
  { slug: 'hotel-condition', name: 'Hotel condition', category: 'Hotel' },
  { slug: 'design', name: 'Design', category: 'Hotel' },
  { slug: 'atmosphere', name: 'Atmosphere', category: 'Hotel' },
  { slug: 'safety', name: 'Safety', category: 'Hotel' },
  { slug: 'elevator', name: 'Elevator', category: 'Hotel' },
  { slug: 'lobby', name: 'Lobby', category: 'Hotel' },
  { slug: 'public-areas', name: 'Public areas', category: 'Hotel' },
  // Staff
  { slug: 'staff-friendliness', name: 'Staff friendliness', category: 'Staff' },
  { slug: 'staff-helpfulness', name: 'Staff helpfulness', category: 'Staff' },
  { slug: 'staff-professionalism', name: 'Staff professionalism', category: 'Staff' },
  { slug: 'reception', name: 'Reception', category: 'Staff' },
  { slug: 'housekeeping-staff', name: 'Housekeeping', category: 'Staff' },
  { slug: 'communication', name: 'Communication', category: 'Staff' },
  { slug: 'check-in', name: 'Check-in', category: 'Staff' },
  { slug: 'check-out', name: 'Check-out', category: 'Staff' },
  // F&B
  { slug: 'breakfast', name: 'Breakfast', category: 'Food' },
  { slug: 'breakfast-selection', name: 'Breakfast selection', category: 'Food' },
  { slug: 'food-quality', name: 'Food quality', category: 'Food' },
  { slug: 'food-value', name: 'Food value', category: 'Food' },
  { slug: 'coffee', name: 'Coffee', category: 'Food' },
  { slug: 'drinks', name: 'Drinks', category: 'Food' },
  // Location
  { slug: 'location', name: 'Location', category: 'Location' },
  { slug: 'public-transport', name: 'Public transport', category: 'Location' },
  { slug: 'train-station', name: 'Train station', category: 'Location' },
  { slug: 'city-center', name: 'City center', category: 'Location' },
  { slug: 'attractions', name: 'Attractions', category: 'Location' },
  { slug: 'restaurants-nearby', name: 'Nearby restaurants', category: 'Location' },
  { slug: 'parking', name: 'Parking', category: 'Location' },
  // Price
  { slug: 'price', name: 'Price', category: 'Price' },
  { slug: 'value-for-money', name: 'Value for money', category: 'Price' },
  { slug: 'fees', name: 'Fees', category: 'Price' },
  { slug: 'extra-charges', name: 'Extra charges', category: 'Price' },
  // Tech
  { slug: 'wifi', name: 'WiFi', category: 'Tech' },
  { slug: 'tv', name: 'TV', category: 'Tech' },
  { slug: 'smart-tv', name: 'Smart TV', category: 'Tech' },
  { slug: 'internet', name: 'Internet', category: 'Tech' },
  // Other
  { slug: 'other', name: 'Other', category: 'Other' },
];

export const DEFAULT_BOOKING_URL =
  'https://www.booking.com/hotel/ch/prizeotel-bern-city.de.html#tab-reviews';

export const DEFAULT_HOTEL_KEY = 'CHBRNPR';

/** Critical keyword hints → CRITICAL priority (case-insensitive). */
export const CRITICAL_KEYWORDS = [
  'mold',
  'mould',
  'schimmel',
  'bed bug',
  'bettwanze',
  'assault',
  'theft',
  'steal',
  'stolen',
  'fire',
  'smoke',
  'danger',
  'unsafe',
  'broken lock',
  'blood',
];

export const HIGH_KEYWORDS = [
  'does not work',
  'nicht funktioniert',
  'broken',
  'kaputt',
  'flood',
  'leak',
  'no hot water',
  'kein warmwasser',
  'extremely loud',
  'sehr laut',
  'could not sleep',
  'nicht schlafen',
];
