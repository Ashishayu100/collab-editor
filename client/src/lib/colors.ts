export interface UserColor {
  color: string;
  colorLight: string;
}

const PALETTE: UserColor[] = [
  { color: '#2196F3', colorLight: '#2196F320' }, // blue
  { color: '#E91E63', colorLight: '#E91E6320' }, // pink
  { color: '#4CAF50', colorLight: '#4CAF5020' }, // green
  { color: '#FF9800', colorLight: '#FF980020' }, // orange
  { color: '#9C27B0', colorLight: '#9C27B020' }, // purple
  { color: '#00BCD4', colorLight: '#00BCD420' }, // cyan
  { color: '#F44336', colorLight: '#F4433620' }, // red
  { color: '#795548', colorLight: '#79554820' }, // brown
];

/** djb2 string hash. */
function hashCode(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Deterministic color assignment so a given user always gets the same color everywhere. */
export function getUserColor(userId: string): UserColor {
  return PALETTE[hashCode(userId) % PALETTE.length];
}
