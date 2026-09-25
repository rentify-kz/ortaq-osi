import { colors, radius, shadow, typography } from './index.js';

/** Тема Tailwind v4 (CSS-first) из тех же токенов, что использует мобильное приложение. */
export function tailwindThemeCss(): string {
  const lines: string[] = [];
  const add = (name: string, value: string | number) => lines.push(`  --${name}: ${value};`);
  for (const [k, v] of Object.entries(colors.accent)) add(`color-accent-${k}`, v);
  add('color-bg-base', colors.bg.base);
  add('color-bg-subtle', colors.bg.subtle);
  add('color-bg-surface', colors.bg.surface);
  add('color-bg-accent-subtle', colors.bg.accentSubtle);
  add('color-bg-accent-muted', colors.bg.accentMuted);
  add('color-text-primary', colors.text.primary);
  add('color-text-secondary', colors.text.secondary);
  add('color-text-tertiary', colors.text.tertiary);
  add('color-text-on-accent', colors.text.onAccent);
  add('color-text-link', colors.text.link);
  add('color-border-subtle', colors.border.subtle);
  add('color-border-default', colors.border.default);
  add('color-border-strong', colors.border.strong);
  add('color-border-focus', colors.border.focus);
  for (const [k, v] of Object.entries(colors.status)) add(`color-${k.replace(/Bg$/, '-bg')}`, v);
  for (const [k, v] of Object.entries(radius)) add(`radius-${k}`, `${v}px`);
  add('shadow-sm', shadow.sm);
  add('shadow-md', shadow.md);
  add('font-sans', `'${typography.fontFamily}', ui-sans-serif, system-ui, sans-serif`);
  const t = typography;
  const text = (name: string, s: { size: number; lineHeight: number }) => {
    add(`text-${name}`, `${s.size}px`);
    add(`text-${name}--line-height`, `${s.lineHeight}px`);
  };
  text('display', t.display);
  text('h1', t.h1);
  text('h2', t.h2);
  text('h3', t.h3);
  text('body-lg', t.bodyLg);
  text('body', t.body);
  text('body-sm', t.bodySm);
  text('label', t.label);
  text('caption', t.caption);
  return `/* Сгенерировано из @ortaq/design-tokens. Не редактировать вручную. */\n@theme {\n${lines.join('\n')}\n}\n`;
}
