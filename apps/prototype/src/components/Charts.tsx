import { motion } from 'motion/react'

const ease = [0.22, 1, 0.36, 1] as const

/* ───────────── Линия остатка ───────────── */

function smooth(pts: [number, number][]) {
  // Catmull-Rom → кубические Безье
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

export function Sparkline({ values, id }: { values: number[]; id: string }) {
  const W = 300, H = 70, pad = 6
  const lo = Math.min(...values), hi = Math.max(...values)
  const pts = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * W,
    pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2),
  ])
  const line = smooth(pts)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[70px] w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L ${W} ${H} L 0 ${H} Z`}
        fill={`url(#${id})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.3, delay: 0.5, ease }}
      />
    </svg>
  )
}

/* ───────────── Индикатор кворума ─────────────
   Отметка порога обязательна: без неё 42% читаются как «почти половина». */

export function Quorum({ value, need }: { value: number; need: number }) {
  return (
    <div className="relative pb-6">
      <div className="h-3 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, delay: 0.45, ease }}
          className="h-full rounded-full bg-brand-500"
        />
      </div>
      <div className="absolute top-[-4px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${need}%` }}>
        <span className="h-5 w-[3px] rounded-full bg-ink" />
        <span className="nums mt-1 whitespace-nowrap text-[11.5px] font-semibold text-ink">нужно {need}%</span>
      </div>
    </div>
  )
}
