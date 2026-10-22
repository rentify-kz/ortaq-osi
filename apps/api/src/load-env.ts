import { existsSync } from 'node:fs'

// Импортируется первым в main.ts: модули читают env() уже при загрузке (JwtModule.register).
// Локально секреты из apps/api/.env; в продакшене их кладёт в окружение секрет-хранилище.
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) process.loadEnvFile('.env')
