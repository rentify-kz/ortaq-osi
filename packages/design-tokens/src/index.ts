/**
 * Единый источник токенов для web (Tailwind) и mobile (StyleSheet).
 * Значения — из docs/spec/12-design-system.md.
 */
export const colors = {
  bg: {
    base: '#FFFFFF',
    subtle: '#F7FAF8',
    surface: '#FFFFFF',
    accentSubtle: '#EDF7EF',
    accentMuted: '#DCEFE1',
  },
  accent: {
    50: '#EDF7EF',
    100: '#DCEFE1',
    200: '#BADFC4',
    300: '#8CC89D',
    400: '#5CAE74',
    500: '#2E8B52',
    600: '#1F6B3F',
    700: '#185231',
    800: '#123D25',
    900: '#0C2A19',
  },
  text: {
    primary: '#0F1711',
    secondary: '#5A6B5F',
    tertiary: '#8A9A8F',
    onAccent: '#FFFFFF',
    link: '#1F6B3F',
  },
  border: {
    subtle: '#EDF2EE',
    default: '#E2EDE4',
    strong: '#CBDECF',
    focus: '#1F6B3F',
  },
  status: {
    success: '#16A34A',
    successBg: '#ECFDF3',
    warning: '#D97706',
    warningBg: '#FFFBEB',
    danger: '#DC2626',
    dangerBg: '#FEF2F2',
    info: '#0284C7',
    infoBg: '#F0F9FF',
  },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const spacing = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const shadow = {
  sm: '0 1px 2px rgba(15,23,17,.04)',
  md: '0 2px 8px rgba(15,23,17,.06)',
} as const;

export const typography = {
  fontFamily: 'Inter',
  display: { size: 32, lineHeight: 40, weight: 700 },
  h1: { size: 24, lineHeight: 32, weight: 700 },
  h2: { size: 20, lineHeight: 28, weight: 600 },
  h3: { size: 17, lineHeight: 24, weight: 600 },
  bodyLg: { size: 17, lineHeight: 26, weight: 400 },
  body: { size: 15, lineHeight: 22, weight: 400 },
  bodySm: { size: 13, lineHeight: 20, weight: 400 },
  label: { size: 13, lineHeight: 18, weight: 500 },
  caption: { size: 12, lineHeight: 16, weight: 400 },
  monoNumber: { size: 15, lineHeight: 22, weight: 500 },
} as const;

/** CSS custom properties для web: подключаются в корневом CSS. */
export function cssVariables(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors.bg)) out[`--bg-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(colors.accent)) out[`--accent-${k}`] = v;
  for (const [k, v] of Object.entries(colors.text)) out[`--text-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(colors.border)) out[`--border-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(colors.status)) out[`--${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(radius)) out[`--radius-${k}`] = `${v}px`;
  return out;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
