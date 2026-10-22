import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Building2, FileCheck2, ShieldCheck, Vote } from 'lucide-react'
import { ease } from '../shared/lib/cn'

const points = [
  { icon: ShieldCheck, text: 'Вход с паролем и кодом из приложения: доступ к деньгам дома под двумя замками' },
  { icon: FileCheck2, text: 'Каждое действие записано в журнал, который нельзя переписать задним числом' },
  { icon: Vote, text: 'Голосования с подписью ЭЦП и протоколом, который не оспорят' },
]

/** Экран входа: слева форма, справа — зачем здесь второй фактор и журнал */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-white"><Building2 size={18} strokeWidth={2.2} /></span>
          <span className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-ink">Ortaq</span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
          className="mx-auto my-auto flex w-full max-w-[420px] flex-col gap-5 py-10"
        >
          {children}
        </motion.div>
        <p className="text-[12.5px] text-ink-3">Данные хранятся в Казахстане</p>
      </div>
      <aside className="hidden flex-col justify-end gap-8 bg-brand-800 p-12 lg:flex">
        <h2 className="max-w-[18ch] font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.035em] text-white">
          Дом, в котором видно, куда идут деньги
        </h2>
        <ul className="flex max-w-[46ch] flex-col gap-4">
          {points.map((p) => (
            <li key={p.text} className="flex items-start gap-3 text-[15px] leading-relaxed text-white/80">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white"><p.icon size={17} strokeWidth={2} /></span>
              {p.text}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

export function AuthTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">{title}</h1>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{sub}</p>}
    </div>
  )
}
