/**
 * Заведение админа платформы. Единственный способ выставить is_platform_admin (через API это невозможно).
 *   pnpm --filter @ortaq/api admin:create --email admin@ortaq.kz --name "Иванов И.И."
 * Печатает ссылку установки пароля (72 часа). Дальше — обязательная настройка TOTP при первом входе.
 */
import { cliContext, arg } from './context.js';

const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim();
if (!email || !name) {
  console.error('Usage: admin:create --email <email> --name "<ФИО>"');
  process.exit(1);
}

const { config, db, crypto } = cliContext();
try {
  const user = await db.user.upsert({
    where: { email },
    create: { email, full_name: name, is_platform_admin: true, status: 'PENDING' },
    update: { is_platform_admin: true },
  });
  const token = crypto.randomToken();
  await db.actionToken.create({
    data: {
      user_id: user.id,
      purpose: 'PASSWORD_SET',
      token_hash: crypto.sha256(token),
      expires_at: new Date(Date.now() + 72 * 3600_000),
    },
  });
  await db.auditLog.create({
    data: { action: 'user.platform_admin.grant', entity_type: 'user', entity_id: user.id, actor_role: 'CLI' },
  });
  console.log(`Админ платформы: ${email} (${user.id})`);
  if (!user.password_hash) console.log(`Ссылка установки пароля: ${config.PUBLIC_WEB_URL}/set-password?token=${token}`);
} finally {
  await db.$disconnect();
}
