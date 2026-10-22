/**
 * Сид. Без флагов — только первый админ платформы из SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * С флагом --demo — демонстрационный дом для локальной разработки (только вне продакшена).
 * 2FA админ и председатель подключают при первом входе, как в жизни.
 *
 *   pnpm --filter @ortaq/api db:seed
 *   pnpm --filter @ortaq/api db:seed -- --demo
 */
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import { ARGON } from '../src/modules/auth/password.service'
import { defaultLayout, generateUnits } from '../src/modules/admin/units.generator'

process.loadEnvFile('.env')
const db = new PrismaClient()

async function admin() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password || password.length < 12) throw new Error('Нужны SEED_ADMIN_EMAIL и SEED_ADMIN_PASSWORD (от 12 символов)')
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return console.log(`Админ ${email} уже есть`)
  await db.user.create({
    data: { email, fullName: 'Администратор платформы', passwordHash: await argon2.hash(password, ARGON), isPlatformAdmin: true, status: 'ACTIVE' },
  })
  console.log(`Админ создан: ${email}`)
}

async function demo() {
  if (process.env.NODE_ENV === 'production') throw new Error('Демо-данные в продакшене запрещены')
  if (await db.organization.findUnique({ where: { bin: '100000000205' } })) return console.log('Демо-дом уже есть')

  const org = await db.organization.create({
    data: { name: 'ОСИ «Асыл Арман-3»', bin: '100000000205', managementForm: 'OSI', legalAddress: 'г. Алматы, мкр. Асыл Арман, 3' },
  })
  const house = await db.house.create({
    data: {
      organizationId: org.id, address: 'г. Алматы, мкр. Асыл Арман, 3', displayName: 'ЖК Асыл Арман, блок 3',
      entranceCount: 4, unitCount: 128, floorCount: 9, builtYear: 2019,
    },
  })
  const units = generateUnits(defaultLayout(house))
  // Площади заполнены у 120 из 128: чек-лист покажет, что голосования пока недоступны
  await db.unit.createMany({
    data: units.map((u, i) => ({ ...u, houseId: house.id, area: i < 120 ? (42 + (i % 5) * 9.5).toFixed(2) : null })),
  })

  const password = process.env.SEED_ADMIN_PASSWORD!
  const chairman = await db.user.create({
    data: { email: 'chairman@ortaq.local', fullName: 'Бауыржан Кенжебаев', passwordHash: await argon2.hash(password, ARGON), status: 'ACTIVE' },
  })
  await db.houseMembership.create({ data: { houseId: house.id, userId: chairman.id, role: 'CHAIRMAN', joinedVia: 'ADMIN_PROVISION' } })

  const applicants = [
    { fullName: 'Асанов Данияр', phone: '+77071234532', unit: '45', relation: 'OWNER' as const, comment: 'Купил квартиру в июне, прошу добавить' },
    { fullName: 'Ким Виктория', phone: '+77019876511', unit: '112', relation: 'TENANT' as const, comment: 'Снимаю квартиру с сентября' },
  ]
  for (const a of applicants) {
    const user = await db.user.create({ data: { fullName: a.fullName, phone: a.phone, status: 'ACTIVE' } })
    await db.joinRequest.create({
      data: { houseId: house.id, userId: user.id, claimedUnitNumber: a.unit, claimedRelation: a.relation, comment: a.comment },
    })
  }
  console.log('Демо-дом создан: ЖК Асыл Арман, блок 3. Председатель chairman@ortaq.local, пароль как у админа')
}

async function main() {
  await admin()
  if (process.argv.includes('--demo')) await demo()
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
