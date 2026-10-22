import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Monitor, Smartphone, ExternalLink } from 'lucide-react'
import { shots, groups, WEB, PHONE, type Shot } from './shots'
import { ease } from '../lib/cn'

/** Масштаб превью: веб-экран 1440×900 и телефон 352×822. При 0.34 три веб-кадра входят в строку */
const WEB_SCALE = 0.34
const PHONE_SCALE = 0.6

/** Монтирует живой экран, только когда кадр рядом с областью просмотра */
function Lazy({ children, w, h }: { children: ReactNode; w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} style={{ width: w, height: h }}>{on && children}</div>
}

/** Живой экран в уменьшенной рамке: интерфейс настоящий, им можно пользоваться */
function Frame({ s, n }: { s: Shot; n: number }) {
  const size = s.kind === 'web' ? WEB : PHONE
  const k = s.kind === 'web' ? WEB_SCALE : PHONE_SCALE
  const w = size.w * k, h = size.h * k
  return (
    <motion.figure
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease }}
      className="m-0 flex flex-col gap-3"
      style={{ width: w }}
    >
      <div
        className={s.kind === 'web' ? 'relative overflow-hidden rounded-[16px] bg-canvas' : 'relative overflow-hidden rounded-[28px]'}
        style={{ width: w, height: h }}
      >
        <Lazy w={w} h={h}>
          <div className="absolute left-0 top-0 origin-top-left bg-canvas" style={{ width: size.w, height: size.h, transform: `scale(${k})` }}>
            {s.render()}
          </div>
        </Lazy>
      </div>
      <figcaption className="flex gap-3">
        <span className="nums grid size-7 shrink-0 place-items-center rounded-full bg-surface font-display text-[12.5px] font-bold text-ink">{n}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold leading-tight text-ink">{s.title}</span>
            <a href={`#shot/${s.id}`} target="_blank" rel="noreferrer" aria-label={`Открыть «${s.title}» отдельно`} className="text-ink-3 transition-colors hover:text-brand-600">
              <ExternalLink size={13} strokeWidth={2.2} />
            </a>
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-ink-2">{s.ux}</span>
        </span>
      </figcaption>
    </motion.figure>
  )
}

export function Board() {
  let n = 0
  return (
    <main className="mx-auto max-w-[1680px] px-6 pb-32 pt-12">
      <header className="max-w-[720px]">
        <h1 className="font-display text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
          Доска экранов <span className="text-ink-3">Ortaq</span>
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
          {shots.length} экранов в четырёх приложениях. Это не скриншоты, а живой интерфейс прототипа в уменьшенном виде: кнопки работают.
          Под каждым экраном решение UX, ради которого он так устроен.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-medium text-ink-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3"><Monitor size={14} strokeWidth={2.2} /> {shots.filter((s) => s.kind === 'web').length} веб</span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3"><Smartphone size={14} strokeWidth={2.2} /> {shots.filter((s) => s.kind === 'phone').length} мобильных</span>
        </div>
      </header>

      {groups.map((g) => {
        const list = shots.filter((s) => s.group === g.g)
        return (
          <section key={g.g} className="mt-16">
            <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">{g.title}</h2>
              <p className="text-[15px] text-ink-2">{g.sub}</p>
            </div>
            <div className="flex flex-wrap items-start gap-x-8 gap-y-10">
              {list.map((s) => { n += 1; return <Frame key={s.id} s={s} n={n} /> })}
            </div>
          </section>
        )
      })}
    </main>
  )
}

/** Один экран в натуральную величину: для экспорта PNG и ссылок с доски */
export function ShotView({ id }: { id: string }) {
  const s = shots.find((x) => x.id === id)
  // Ждём Manrope и Onest: иначе headless-экспорт снимает кадр системным шрифтом.
  // Пока шрифтов нет, кадр пустой, и скрипт экспорта повторяет снимок с запасом времени.
  const [fonts, setFonts] = useState(false)
  useEffect(() => {
    const done = () => setFonts(true)
    Promise.all([document.fonts.load('700 16px Manrope'), document.fonts.load('400 16px Onest')]).then(done, done)
  }, [])
  if (!s) return <p className="p-8 text-ink">Экран «{id}» не найден</p>
  if (!fonts) return null
  if (s.kind === 'web') return <div style={{ width: WEB.w, minHeight: WEB.h }}>{s.render()}</div>
  return <div className="inline-block p-6">{s.render()}</div>
}
