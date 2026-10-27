const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns `#rrggbb` in lowercase, or null when the value is not a hex color. */
export function normalizeHex(value) {
  const match = HEX.exec(String(value ?? '').trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return `#${hex.toLowerCase()}`;
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Black or white, whichever reads better on the given background (WCAG relative luminance). */
export function readableTextColor(background) {
  const hex = normalizeHex(background) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
