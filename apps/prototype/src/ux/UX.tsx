import type { ReactNode } from 'react'
import { Personas } from './Personas'
import { Journey } from './Journey'
import { Sitemap } from './Sitemap'
import { Flows } from './Flows'

const sections = [
  { id: 'personas', title: 'Персоны', sub: 'Вымышленные пользователи, собранные из ролей и сценариев продукта', el: <Personas /> },
  { id: 'journey', title: 'Путь клиента', sub: 'Сквозные сценарии через роли с кривой эмоций', el: <Journey /> },
  { id: 'sitemap', title: 'Карта сайта', sub: 'Все построенные экраны четырёх приложений', el: <Sitemap /> },
  { id: 'flows', title: 'Пользовательские потоки', sub: 'Ключевые задачи с развилками и шагами системы', el: <Flows /> },
]

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-6">
      <h2 className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
      <p className="mb-6 mt-1 text-[15px] text-ink-2">{sub}</p>
      {children}
    </section>
  )
}

export function UX() {
  return (
    <main className="mx-auto max-w-[1680px] px-6 pb-32 pt-12">
      <header className="max-w-[760px]">
        <h1 className="font-display text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
          UX-документация <span className="text-ink-3">Ortaq</span>
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
          Построено по прототипу: каждая персона, шаг пути и узел потока ссылается на настоящий экран.
        </p>
        <nav aria-label="Разделы документации" className="mt-5 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.id} href={`#ux`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }) }} className="inline-flex h-10 items-center rounded-full bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-brand-50 hover:text-brand-700">
              {s.title}
            </a>
          ))}
        </nav>
      </header>
      {sections.map((s) => <Section key={s.id} id={s.id} title={s.title} sub={s.sub}>{s.el}</Section>)}
    </main>
  )
}
