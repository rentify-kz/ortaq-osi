import { useState } from 'react'
import { motion } from 'motion/react'
import { Megaphone, Building2, UserRound, ChevronRight, Pin, Phone, Clock3, FileText, Download, BadgeCheck, LogOut, Languages, type LucideIcon } from 'lucide-react'
import { Scroll, Block, Group, Label } from '../../components/Bits'
import { Segmented, Toggle } from '../../components/web/ui'
import { useResident, RHead, BackBar, type Views } from './state'
import { me, residentNews } from '../../data/resident'
import { staff, contractors, documents } from '../../data/chairman'
import { ease } from '../../lib/cn'

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

/* Прозрачность: жилец видит только тех, кого председатель отметил «виден жильцам»,
   и только опубликованные документы */
const visibleStaff = staff.filter((s) => s.visible)
const visibleFirms = contractors.filter((c) => c.visible)
const publicDocs = documents.filter((d) => d.access === 'public' && d.sign !== 'unsigned' && (d.kind === 'report' || d.kind === 'protocol' || d.kind === 'act'))

function News() {
  const pinned = residentNews.filter((n) => n.pinned)
  const rest = residentNews.filter((n) => !n.pinned)
  return (
    <>
      {pinned.map((n) => (
        <motion.article key={n.id} variants={rise} className="flex flex-col gap-2 rounded-[22px] bg-surface p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-700"><Pin size={14} strokeWidth={2.4} /> Закреплено · {n.when}</p>
          <p className="font-display text-[18px] font-bold leading-snug text-ink">{n.title}</p>
          <p className="text-[15px] leading-relaxed text-ink">{n.text}</p>
          <p className="text-[13px] text-ink-2">{n.to}, от председателя</p>
        </motion.article>
      ))}
      <Group>
        <Label>Ранее</Label>
        {rest.map((n) => (
          <motion.article key={n.id} variants={rise} className="flex flex-col gap-1.5 rounded-[22px] bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[15.5px] font-semibold leading-snug text-ink">{n.title}</p>
              <span className="shrink-0 text-[13px] text-ink-2">{n.when}</span>
            </div>
            <p className="text-[14.5px] leading-relaxed text-ink-2">{n.text}</p>
          </motion.article>
        ))}
      </Group>
    </>
  )
}

function House() {
  return (
    <>
      <Group>
        <Label>Правление</Label>
        <Block className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold text-ink">Бауыржан Кенжебаев</span>
            <span className="block text-[13.5px] text-ink-2">Председатель ОСИ</span>
          </span>
          <a href="tel:+77017771240" aria-label="Позвонить председателю" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Phone size={18} strokeWidth={2.2} />
          </a>
        </Block>
      </Group>

      <Group>
        <Label>Персонал</Label>
        <Block className="!p-2">
          {visibleStaff.map((s) => (
            <div key={s.name} className="flex flex-col gap-1 rounded-[14px] p-2.5">
              <span className="text-[15px] font-semibold text-ink">{s.name}</span>
              <span className="text-[13.5px] text-ink-2">{s.role}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Clock3 size={13} strokeWidth={2.2} /> {s.schedule}</span>
            </div>
          ))}
        </Block>
      </Group>

      <Group>
        <Label>Подрядчики</Label>
        <Block className="!p-2">
          {visibleFirms.map((c) => (
            <div key={c.name} className="flex flex-col gap-0.5 rounded-[14px] p-2.5">
              <span className="text-[15px] font-semibold text-ink">{c.name}</span>
              <span className="text-[13.5px] text-ink-2">{c.service}, договор до {c.until}</span>
            </div>
          ))}
        </Block>
      </Group>

      <Group>
        <Label>Документы</Label>
        <Block className="!p-2">
          {publicDocs.map((d) => (
            <button key={d.title} className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left">
              <FileText size={18} strokeWidth={2} className="shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-ink">{d.title}</span>
                <span className="block text-[12.5px] text-ink-2">{d.date}, {d.size}</span>
              </span>
              <Download size={17} strokeWidth={2} className="shrink-0 text-ink-2" />
            </button>
          ))}
        </Block>
      </Group>
    </>
  )
}

function Profile() {
  const [push, setPush] = useState(true)
  const [lang, setLang] = useState<'ru' | 'kk'>('ru')
  return (
    <>
      <Block className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-[20px] font-bold text-brand-700">{me.initials}</span>
        <div>
          <p className="font-display text-[19px] font-bold text-ink">{me.name}</p>
          <p className="text-[14.5px] text-ink-2">кв. {me.flat}, {me.relation}</p>
        </div>
      </Block>
      <Block className="flex flex-col gap-2.5 text-[14.5px]">
        <p className="flex items-center gap-2 font-medium text-brand-700"><BadgeCheck size={18} strokeWidth={2.2} /> Личность подтверждена через eGov</p>
        <p className="flex justify-between gap-3"><span className="text-ink-2">Площадь квартиры</span><span className="font-medium text-ink">{String(me.area).replace('.', ',')} м²</span></p>
        <p className="flex justify-between gap-3"><span className="text-ink-2">Вес голоса</span><span className="font-medium text-ink">{me.weight}</span></p>
      </Block>
      <Block className="flex flex-col gap-3">
        <Toggle on={push} onChange={setPush} label="Уведомления о заявках и голосованиях" />
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[14px] text-ink"><Languages size={16} strokeWidth={2} className="text-ink-2" /> Язык</span>
          <Segmented id="res-lang" value={lang} onChange={setLang} options={[{ v: 'ru', label: 'Русский' }, { v: 'kk', label: 'Қазақша' }]} />
        </div>
      </Block>
      <button className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-surface text-[15px] font-semibold text-ink-2">
        <LogOut size={18} strokeWidth={2.2} /> Выйти
      </button>
    </>
  )
}

const menu: { v: Exclude<Views['more'], 'menu'>; label: string; sub: string; icon: LucideIcon }[] = [
  { v: 'news', label: 'Объявления', sub: 'Отключения, собрания, субботники', icon: Megaphone },
  { v: 'house', label: 'Мой дом', sub: 'Кто работает в доме, отчёты и протоколы', icon: Building2 },
  { v: 'profile', label: 'Профиль', sub: 'Квартира, вес голоса, уведомления', icon: UserRound },
]
const titles = { news: 'Объявления', house: 'Мой дом', profile: 'Профиль' }

export function RMore() {
  const { views, setView } = useResident()
  const v = views.more

  if (v !== 'menu') {
    return (
      <>
        <BackBar label="Ещё" onBack={() => setView('more', 'menu')} />
        <Scroll>
          <h1 className="px-1 font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">{titles[v]}</h1>
          {v === 'news' && <News />}
          {v === 'house' && <House />}
          {v === 'profile' && <Profile />}
        </Scroll>
      </>
    )
  }

  return (
    <>
      <RHead title="Ещё" />
      <Scroll>
        {menu.map((m) => (
          <motion.button key={m.v} variants={rise} onClick={() => setView('more', m.v)} className="flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><m.icon size={21} strokeWidth={2} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-ink">{m.label}</span>
              <span className="block text-[13.5px] text-ink-2">{m.sub}</span>
            </span>
            <ChevronRight size={20} strokeWidth={2.2} className="shrink-0 text-ink-3" />
          </motion.button>
        ))}
      </Scroll>
    </>
  )
}
