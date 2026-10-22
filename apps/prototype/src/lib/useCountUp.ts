import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { money } from './cn'

/** Рост значения из нуля на входе экрана */
export function useCountUp(to: number, { duration = 1.1, delay = 0.35 } = {}) {
  const reduce = useReducedMotion()
  const [v, setV] = useState(reduce ? to : 0)
  useEffect(() => {
    if (reduce) { setV(to); return }
    const c = animate(0, to, { duration, delay, ease: [0.22, 1, 0.36, 1], onUpdate: setV })
    return () => c.stop()
  }, [to, duration, delay, reduce])
  return v
}

/** 87.4 → "87,4"; 1840000 → "1 840 000" */
export const fmt = (n: number, decimals = 0) =>
  decimals ? n.toFixed(decimals).replace('.', ',') : money(Math.round(n))
