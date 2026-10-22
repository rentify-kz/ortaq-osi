import { useState } from 'react'
import { Bell, UserPlus, Languages, Check, LogOut } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Segmented, Toggle, Field, Input, Empty, type Go } from '../../components/web/ui'

const notifications = [
  { id: 'new', label: 'Новые заявки жильцов', on: true },
  { id: 'night', label: 'Срочные заявки ночью, с 22:00 до 7:00', on: true },
  { id: 'checks', label: 'Чеки жильцов на проверку', on: true },
  { id: 'digest', label: 'Сводка за неделю по понедельникам', on: false },
]

export function Settings() {
  const [notif, setNotif] = useState(notifications)
  const [lang, setLang] = useState<'ru' | 'kk'>('ru')
  const [phone, setPhone] = useState('')
  const [invited, setInvited] = useState(false)
  const phoneOk = phone.replace(/\D/g, '').length === 11

  return (
    <>
      <PageHead title="Настройки" sub="Бауыржан Кенжебаев, председатель ОСИ «Асыл Арман, блок 3»" />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card delay={0.08} lift={false} className="flex flex-col gap-2">
          <CardHead title="Уведомления" sub="Что присылать на телефон" icon={<Bell size={18} strokeWidth={2} />} />
          <div className="mt-2 flex flex-col">
            {notif.map((n) => (
              <Toggle
                key={n.id}
                on={n.on}
                label={n.label}
                onChange={(v) => setNotif((l) => l.map((x) => (x.id === n.id ? { ...x, on: v } : x)))}
              />
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card delay={0.15} lift={false} className="flex flex-col gap-4">
            <CardHead
              title="Бухгалтер"
              sub="Вносит операции и готовит отчёт. Утверждаете и подписываете вы"
              icon={<UserPlus size={18} strokeWidth={2} />}
            />
            {invited ? (
              <div className="flex items-center gap-2.5 rounded-[16px] bg-brand-50 px-4 py-3 text-[14px] text-brand-700">
                <Check size={18} strokeWidth={2.6} /> Приглашение отправлено на {phone}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (phoneOk) setInvited(true) }} className="flex flex-col gap-3">
                <Field label="Телефон бухгалтера" hint={phone && !phoneOk ? 'Нужен номер из 11 цифр, например +7 701 234 56 78' : undefined}>
                  <Input value={phone} onChange={setPhone} placeholder="+7 701 234 56 78" />
                </Field>
                <div><Btn type="submit" disabled={!phoneOk}>Пригласить</Btn></div>
              </form>
            )}
          </Card>

          <Card delay={0.22} lift={false} className="flex flex-col gap-4">
            <CardHead title="Язык интерфейса" icon={<Languages size={18} strokeWidth={2} />} />
            <Segmented id="lang" value={lang} onChange={setLang} options={[{ v: 'ru', label: 'Русский' }, { v: 'kk', label: 'Қазақша' }]} />
          </Card>
        </div>
      </div>
    </>
  )
}

export function Logout({ go }: { go: Go }) {
  return (
    <>
      <PageHead title="Выход" />
      <Card delay={0.08} lift={false} className="py-14">
        <Empty
          icon={LogOut}
          title="Выйти из кабинета на этом компьютере?"
          text="Заявки и уведомления продолжат приходить в мобильное приложение."
          action={
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => go('Дашборд')}>Остаться</Btn>
              <Btn onClick={() => go('Дашборд')}>Выйти</Btn>
            </div>
          }
        />
      </Card>
    </>
  )
}
