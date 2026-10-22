import { useState } from 'react'
import { Phone, Clock3, LogOut, Languages } from 'lucide-react'
import { AppBar, Scroll, Block, Group, Label } from '../../components/Bits'
import { Segmented, Toggle } from '../../components/web/ui'
import { me } from '../../data/worker'

export function WProfile() {
  const [push, setPush] = useState(true)
  const [lang, setLang] = useState<'ru' | 'kk'>('ru')

  return (
    <>
      <AppBar left={<h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Профиль</h1>} />
      <Scroll>
        <Block className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-[20px] font-bold text-brand-700">СП</span>
          <div>
            <p className="font-display text-[19px] font-bold text-ink">{me.name}</p>
            <p className="text-[14.5px] text-ink-2">{me.role}, {me.house}</p>
          </div>
        </Block>

        <Block className="flex flex-col gap-3 text-[15px] text-ink">
          <p className="flex items-center gap-3"><Clock3 size={18} strokeWidth={2} className="text-ink-2" /> {me.schedule}</p>
          <p className="nums flex items-center gap-3"><Phone size={18} strokeWidth={2} className="text-ink-2" /> {me.phone}</p>
          <p className="text-[13px] text-ink-2">Жильцы видят ваше имя, должность, рабочий телефон и график</p>
        </Block>

        <Group>
          <Label>Связь с председателем</Label>
          <a
            href={`tel:${me.chairman.phone.replace(/\s/g, '')}`}
            className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-brand-600 text-[16px] font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Phone size={18} strokeWidth={2.2} /> Позвонить: {me.chairman.name}
          </a>
        </Group>

        <Block className="flex flex-col gap-3">
          <Toggle on={push} onChange={setPush} label="Уведомления о новых задачах" />
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] text-ink"><Languages size={16} strokeWidth={2} className="text-ink-2" /> Язык</span>
            <Segmented id="w-lang" value={lang} onChange={setLang} options={[{ v: 'ru', label: 'Русский' }, { v: 'kk', label: 'Қазақша' }]} />
          </div>
        </Block>

        <button className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-surface text-[15px] font-semibold text-ink-2">
          <LogOut size={18} strokeWidth={2.2} /> Выйти
        </button>
      </Scroll>
    </>
  )
}
