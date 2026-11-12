export const BUILD = '2026-11-12 · v32 · back, play, next';
// Fictional practice values. Nothing here is a real flight, ID or credential.
export const PRACTICE = {
  airline: 'Practice Air',
  flight: 'PA101',
  date: 'practice-day',
  passenger: 'Sample Traveller',
  ref: 'DEMO01',
  from: { city: 'Bengaluru', code: 'BLR' },
  to: { city: 'Mumbai', code: 'BOM' },
  terminal: '2',
  checkin: 'C5',
  gateOriginal: '12',
  gateChanged: '18',
  seat: '14A',
  boarding: '10:00',
  departure: '10:40',
};

const DEFAULT_NAME = 'Sample Traveller';
const clean = (raw) => String(raw || '').replace(/[^\p{L}\s'.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** The learner's name, used on the booking, ID, boarding pass and spoken prompts. Stored on this device only. */
export function setPassenger(raw) {
  const c = clean(raw);
  PRACTICE.hasName = c.length > 0;
  PRACTICE.passenger = c ? titleCase(c) : DEFAULT_NAME;
  PRACTICE.passengerUpper = PRACTICE.passenger.toUpperCase();
  try { c ? localStorage.setItem('saath.name', c) : localStorage.removeItem('saath.name'); } catch { /* private mode */ }
  return PRACTICE.passenger;
}
PRACTICE.hasName = false;
PRACTICE.passengerUpper = PRACTICE.passenger.toUpperCase();
try { const saved = localStorage.getItem('saath.name'); if (saved) setPassenger(saved); } catch { /* ignore */ }

export const COLORS = {
  teal: '#1b8a86',
  tealDark: '#146e6b',
  tealGlow: '#38e1d2',
  navy: '#0b1f33',
  ink: '#0f2236',
  muted: '#4d6173',
  glass: 'rgba(247,249,249,0.94)',
  cream: '#f3efe4',
  warn: '#d4344f',
  yellow: '#f6c90e',
};

// Stage design size (metres). The room fitter scales this down for small rooms.
// Small on purpose: the world "walks" towards the learner, so only the near field must fit the real room.
export const STAGE = { width: 2.2, depth: 2.4, minScale: 0.45 };
