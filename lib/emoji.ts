// Fun avatar emojis auto-assigned to each person.
export const PERSON_EMOJIS = [
  '🦊', '🐼', '🐨', '🦁', '🐯', '🐵', '🐸', '🐰', '🐷', '🐮',
  '🐙', '🦄', '🐱', '🐶', '🦉', '🦋', '🐢', '🐳', '🐝', '🐧',
  '🦔', '🐺', '🐻', '🐡', '🦩', '🦦', '🦥', '🐌',
];

// Pick an emoji not already used; falls back to a random one once they're exhausted.
export function pickEmoji(used: string[] = []): string {
  const free = PERSON_EMOJIS.filter((e) => !used.includes(e));
  const pool = free.length ? free : PERSON_EMOJIS;
  return pool[Math.floor(Math.random() * pool.length)];
}
