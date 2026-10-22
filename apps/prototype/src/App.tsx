import { useEffect, useState, type ReactNode } from 'react'
import { motion, MotionConfig, MotionGlobalConfig } from 'motion/react'
import { Monitor, Smartphone, LayoutGrid, Workflow } from 'lucide-react'
import { Phone, Caption } from './components/Phone'
import { ResidentApp } from './screens/resident/ResidentApp'
import { ChairmanApp } from './screens/mobile/ChairmanApp'
import { WorkerApp } from './screens/worker/WorkerApp'
import { ChairmanWeb } from './screens/web/ChairmanWeb'
import { Board, ShotView } from './board/Board'
import { UX } from './ux/UX'
import { cn } from './lib/cn'

const chairman = [
  { tab: 0, name: 'Задачи', note: 'Новые заявки сверху. От push до назначенного исполнителя три нажатия, работы принимаются с фото.' },
  { tab: 1, name: 'Поручить', note: 'Надиктуйте обход дома: ИИ разобьёт на задачи и подберёт исполнителей, отправка только после проверки.' },
  { tab: 2, name: 'Объявления', note: 'Видно, кто прочитал. Объявление о воде уходит в дом за минуту, прямо со двора.' },
]

const worker = [
  { key: 'list', tab: 0, name: 'Мои задачи', note: 'Срочное сверху, рутина отдельно. Метка «нужно фото» заранее, чтобы не возвращаться в подвал.' },
  { key: 'done', tab: 0, view: { name: 'complete' as const, id: 2 }, name: 'Завершение', note: 'Крупные кнопки под перчатки, комментарий в одно касание. Без сети отметка уходит в очередь.' },
  { key: 'news', tab: 1, name: 'Объявления', note: 'Только для всех и для персонала. Финансы, жильцов и чужие заявки работник не видит.' },
]

const resident = [
  { key: 'home', tab: 0 as const, name: 'Главная', note: 'Сверху то, что ждёт вашего участия: взносы и голосование. Когда ничего не нужно, блок исчезает.' },
  { key: 'new', tab: 1 as const, views: { req: { name: 'new' as const } }, name: 'Новая заявка', note: 'Место плитками, а не списком. ИИ проверит, не сообщали ли уже, и предложит подписаться.' },
  { key: 'fin', tab: 2 as const, name: 'Финансы дома', note: 'Каждая строка раскрывается до чека и акта. Должники поимённо не показаны.' },
]

type View = 'web' | 'mobile' | 'board' | 'ux'
const VIEWS: View[] = ['web', 'mobile', 'board', 'ux']
const readHash = () => decodeURIComponent(location.hash.slice(1))
const readView = (): View => VIEWS.find((v) => v === readHash()) ?? 'web'

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="mx-auto mb-20 max-w-[1180px]">
      <div className="mb-8 text-center">
        <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
        <p className="mx-auto mt-1.5 max-w-[560px] text-[15px] text-ink-2">{sub}</p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-12">{children}</div>
    </section>
  )
}

function Mobile() {
  return (
    <main className="min-h-dvh px-4 pb-28 pt-12 md:pt-16">
      <header className="mx-auto mb-12 max-w-[640px] text-center">
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          className="text-[13px] font-semibold text-brand-600"
        >
          Ortaq · направление
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 font-display text-[clamp(28px,5vw,40px)] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink text-balance"
        >
          Мобильное <span className="text-ink-3">приложение</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.6] text-ink-2"
        >
          Без рамок и эмодзи, стекло на плавающих слоях, Manrope + Onest с полной кириллицей,
          анимации на входе и на всех значениях.
        </motion.p>
      </header>

      <Section title="Председатель" sub="Три вкладки: то, что нужно сделать на ходу. Отчёты, голосования и финансы остаются в веб-кабинете">
        {chairman.map((c, i) => (
          <figure key={c.name} className="m-0">
            <Phone delay={0.1 + i * 0.12}><ChairmanApp initial={c.tab} id={`chair-${c.tab}`} /></Phone>
            <Caption role="Председатель · мобильное" name={c.name} note={c.note} />
          </figure>
        ))}
      </Section>

      <Section title="Работник" sub="Сантехник, электрик, дворник: один экран с тем, что делать сегодня, и отметка выполнения с фото">
        {worker.map((w, i) => (
          <figure key={w.key} className="m-0">
            <Phone delay={0.15 + i * 0.12}><WorkerApp initialTab={w.tab} initialView={w.view} id={`worker-${w.key}`} /></Phone>
            <Caption role="Работник · мобильное" name={w.name} note={w.note} />
          </figure>
        ))}
      </Section>

      <Section title="Жилец" sub="Главное приложение продукта: участие в жизни дома и прозрачность его бюджета">
        {resident.map((r, i) => (
          <figure key={r.key} className="m-0">
            <Phone delay={0.2 + i * 0.12}><ResidentApp initialTab={r.tab} initialViews={r.views} id={`res-${r.key}`} /></Phone>
            <Caption role="Жилец · мобильное" name={r.name} note={r.note} />
          </figure>
        ))}
      </Section>
    </main>
  )
}

/** Переключатель витрины — плавающая стеклянная пилюля */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts = [
    { v: 'web' as const, icon: Monitor, label: 'Веб · председатель' },
    { v: 'mobile' as const, icon: Smartphone, label: 'Мобильное' },
    { v: 'board' as const, icon: LayoutGrid, label: 'Экраны' },
    { v: 'ux' as const, icon: Workflow, label: 'UX' },
  ]
  return (
    <nav aria-label="Витрина" className="glass fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full p-1.5">
      {opts.map((o) => {
        const on = o.v === view
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            aria-pressed={on}
            className="relative flex h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium"
          >
            {on && (
              <motion.span
                layoutId="view-pill"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-full bg-ink"
              />
            )}
            <o.icon size={16} strokeWidth={2} className={cn('relative', on ? 'text-white' : 'text-ink-2')} />
            <span className={cn('relative whitespace-nowrap', on ? 'font-semibold text-white' : 'text-ink-2')}>{o.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function App() {
  const [view, setView] = useState<View>(readView)
  const [hash, setHash] = useState(readHash)
  useEffect(() => {
    const on = () => { setView(readView()); setHash(readHash()) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const change = (v: View) => {
    location.hash = v
    window.scrollTo({ top: 0 })
  }

  // Один экран в натуральную величину: для экспорта PNG, без переключателя витрины
  // Отдельный кадр статичен: анимации выключены, чтобы снимок не поймал середину перехода
  MotionGlobalConfig.skipAnimations = hash.startsWith('shot/')
  if (hash.startsWith('shot/')) {
    return <MotionConfig reducedMotion="user"><ShotView id={hash.slice(5)} /></MotionConfig>
  }

  return (
    // Уважает prefers-reduced-motion и для JS-анимаций motion, а не только для CSS
    <MotionConfig reducedMotion="user">
      {view === 'web' && <ChairmanWeb key="web" />}
      {view === 'mobile' && <Mobile key="mobile" />}
      {view === 'board' && <Board key="board" />}
      {view === 'ux' && <UX key="ux" />}
      <ViewSwitch view={view} onChange={change} />
    </MotionConfig>
  )
}
