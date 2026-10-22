import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Signal, Wifi, BatteryMedium } from 'lucide-react'

export function Phone({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className="w-[352px] max-w-full shrink-0 rounded-[46px] bg-gradient-to-b from-[#36413a] to-[#121815] p-[11px]"
    >
      <div data-sheet-root className="relative flex h-[800px] flex-col overflow-hidden rounded-[36px] bg-canvas">
        <div className="relative z-20 flex shrink-0 items-center justify-between px-6 pb-1 pt-3.5 text-ink">
          <span className="nums font-display text-[13px] font-bold">9:41</span>
          <div className="flex items-center gap-1.5 opacity-85">
            <Signal size={13} strokeWidth={2.6} />
            <Wifi size={13} strokeWidth={2.6} />
            <BatteryMedium size={16} strokeWidth={2.2} />
          </div>
        </div>
        {children}
      </div>
    </motion.div>
  )
}

export function Caption({ role, name, note }: { role: string; name: string; note: string }) {
  return (
    <figcaption className="mx-auto mt-4 max-w-[340px] text-center">
      <span className="block text-[13px] font-semibold text-brand-600">{role}</span>
      <span className="mt-1 block font-display text-[16px] font-bold tracking-[-0.01em] text-ink">{name}</span>
      <span className="mt-1.5 block text-[13px] leading-[1.5] text-ink-2">{note}</span>
    </figcaption>
  )
}
