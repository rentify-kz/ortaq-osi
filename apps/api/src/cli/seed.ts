/**
 * Сид для local: синтетические данные, никаких реальных ПДн (docs/spec/01-architecture.md §7).
 * Идемпотентен. Печатает учётки и TOTP-секреты для добавления в аутентификатор.
 */
import * as argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';
import { cliContext } from './context.js';
import { planUnits } from '../modules/admin/unit-layout.js';

const { config, db, crypto } = cliContext();
if (config.NODE_ENV === 'production') {
  console.error('Сид запрещён в production');
  process.exit(1);
}

const PASSWORD = 'ortaq-local-password';
// Фиксированные секреты только для local: их можно один раз добавить в аутентификатор.
const ACCOUNTS = [
  { email: 'admin@ortaq.local', name: 'Админ Платформы', admin: true, totp: 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD' },
  { email: 'chairman.a@ortaq.local', name: 'Председатель Дома А', admin: false, totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
  { email: 'chairman.b@ortaq.local', name: 'Председатель Дома Б', admin: false, totp: 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U' },
] as const;

try {
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const users: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const u = await db.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        full_name: a.name,
        is_platform_admin: a.admin,
        password_hash: hash,
        password_changed_at: new Date(),
        totp_secret_encrypted: crypto.encryptTotpSecret(a.totp),
        totp_enabled_at: new Date(),
        status: 'ACTIVE',
      },
      update: {},
    });
    users[a.email] = u.id;
  }

  const org = await db.organization.upsert({
    where: { bin: '990940000036' },
    create: { name: 'ОСИ «Асыл Арман»', bin: '990940000036', management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 150' },
    update: {},
  });

  const houses = [
    { name: 'ЖК Асыл Арман, блок 3', address: 'г. Алматы, ул. Абая 150/3', entrances: 4, units: 128, floors: 9, chairman: 'chairman.a@ortaq.local' },
    { name: 'ЖК Асыл Арман, блок 4', address: 'г. Алматы, ул. Абая 150/4', entrances: 2, units: 36, floors: 9, chairman: 'chairman.b@ortaq.local' },
  ];
  for (const h of houses) {
    let house = await db.house.findFirst({ where: { organization_id: org.id, display_name: h.name } });
    if (!house) {
      house = await db.house.create({
        data: { organization_id: org.id, display_name: h.name, address: h.address, entrance_count: h.entrances, unit_count: h.units, floor_count: h.floors },
      });
      const plan = planUnits({ entrance_count: h.entrances, unit_count: h.units, floor_count: h.floors });
      if (!plan.ok) throw new Error(plan.reason);
      await db.unit.createMany({
        data: plan.units.map((u) => ({ id: uuidv7(), house_id: house!.id, number: u.number, entrance: u.entrance, floor: u.floor })),
      });
      await db.houseMembership.create({
        data: { house_id: house.id, user_id: users[h.chairman]!, role: 'CHAIRMAN', joined_via: 'ADMIN_PROVISION' },
      });
    }
  }

  console.log('Сид применён. Пароль для всех учёток:', PASSWORD);
  for (const a of ACCOUNTS) console.log(`  ${a.email.padEnd(26)} TOTP-секрет ${a.totp}`);
} finally {
  await db.$disconnect();
}
