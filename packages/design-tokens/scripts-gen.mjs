import { writeFileSync } from 'node:fs';
import { tailwindThemeCss } from './dist/tailwind.js';
writeFileSync(new URL('./dist/theme.css', import.meta.url), tailwindThemeCss());
