import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Timer, Paperclip, Scale, Check, Lock, ExternalLink, BadgeCheck, EyeOff, LoaderCircle } from 'lucide-react'
import { Scroll, Block, Group, Label, Btn } from '../../components/Bits'
import { Sheet } from '../../components/Sheet'
import { Quorum } from '../../components/Charts'
import { useResident, BackBar } from './state'
import { activeVote as v } from '../../data/chairman'
import { me } from '../../data/resident'
import { cn, ease } from '../../lib/cn'

const OPTIONS = ['За', 'Против', 'Воздержался']
/** Сколько ждём подпись из eGov mobile в прототипе */
const SIGN_MS = 1600
const SIGNED_AT = '16 сентября, 14:32'

export function VoteScreen() {
  const { setView, vote, setVote } = useResident()
  const [choice, setChoice] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    if (!signing) return
    const t = setTimeout(() => {
      setVote({ choice: choice!, at: SIGNED_AT })
      setSigning(false)
      setSheet(false)
    }, SIGN_MS)
    return () => clearTimeout(t)
  }, [signing, choice, setVote])

  const back = () => setView('home', 'main')

  if (vote) {
    return (
      <>
        <BackBar label="Главная" onBack={back} />
        <Scroll>
          <Block className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-white"><Check size={30} strokeWidth={2.6} /></span>
            <p className="font-display text-[21px] font-bold text-ink">Ваш голос учтён</p>
            <p className="text-[14.5px] text-ink-2">{vote.at}</p>
          </Block>
          <Block className="flex flex-col gap-3 text-[14.5px]">
            <p className="flex justify-between gap-3"><span className="text-ink-2">Ответ</span><span className="font-semibold text-ink">{vote.choice}</span></p>
            {/* Вес голоса показывается обязательно: жилец ждёт «один человек, один голос» */}
            <p className="flex justify-between gap-3"><span className="text-ink-2">Вес голоса</span><span className="font-semibold text-ink">{me.weight}</span></p>
            <p className="text-[13.5px] leading-snug text-ink-2">Голоса считаются по площади квартиры: у вас {String(me.area).replace('.', ',')} м². Так требует закон.</p>
            <p className="flex items-center gap-2 font-medium text-brand-700"><BadgeCheck size={17} strokeWidth={2.2} /> Подписано ЭЦП через eGov mobile</p>
          </Block>
          <Block className="flex items-start gap-3 text-[13.5px] leading-snug text-ink-2">
            <EyeOff size={17} strokeWidth={2} className="mt-0.5 shrink-0" />
            Результаты будут видны после закрытия голосования {v.ends}. Изменить подписанный голос нельзя.
          </Block>
          <Group><Btn full className="!h-12" onClick={back}>На главную</Btn></Group>
        </Scroll>
      </>
    )
  }

  return (
    <>
      <BackBar label="Главная" onBack={back} />
      <Scroll>
        <Group>
          <h1 className="px-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{v.title}</h1>
          <p className="flex items-center gap-2 px-1 text-[14px] text-ink-2"><Timer size={15} strokeWidth={2.2} /> До окончания {v.left}</p>
        </Group>

        <Block>
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-ink-2">Проголосовало по площади</span>
            <span className="nums font-display text-[22px] font-extrabold text-ink">42,3%</span>
          </div>
          <div className="mt-2"><Quorum value={v.turnout} need={v.need} /></div>
        </Block>

        <Group>
          <Label>Материалы</Label>
          <Block className="!p-2">
            {['Коммерческие предложения (3)', 'Дефектный акт'].map((f) => (
              <button key={f} className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left text-[14.5px] text-ink">
                <Paperclip size={16} strokeWidth={2.2} className="shrink-0 text-ink-2" /> {f}
              </button>
            ))}
          </Block>
        </Group>

        <Group>
          <Label>Вопрос</Label>
          <Block className="flex flex-col gap-3">
            <p className="text-[16px] font-semibold leading-snug text-ink">Утвердить замену лифта во 2 подъезде за счёт средств капитального ремонта?</p>
            <div role="radiogroup" className="flex flex-col gap-1.5">
              {OPTIONS.map((o) => {
                const on = choice === o
                return (
                  <button
                    key={o}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChoice(o)}
                    className={cn('flex min-h-14 items-center gap-3 rounded-[16px] px-4 text-left text-[16px] font-semibold transition-colors', on ? 'bg-brand-50 text-ink' : 'bg-surface-2 text-ink')}
                  >
                    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', on ? 'bg-brand-600' : 'bg-surface-3')}>
                      {on && <span className="size-2.5 rounded-full bg-white" />}
                    </span>
                    {o}
                  </button>
                )
              })}
            </div>
            <p className="flex items-start gap-2 rounded-[14px] bg-surface-2 p-3 text-[13.5px] leading-snug text-ink">
              <Scale size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-brand-600" />
              Крупный расход: решение принимается, если «за» 2/3 голосов
            </p>
          </Block>
        </Group>

        <Group>
          <Btn full disabled={!choice} className="!h-14 !text-[16px]" onClick={() => setSheet(true)}>Подписать и отправить</Btn>
          {!choice && <p className="text-center text-[13.5px] text-ink-2">Выберите ответ</p>}
        </Group>
      </Scroll>

      <Sheet open={sheet} onClose={() => !signing && setSheet(false)} title="Подпись бюллетеня">
        <AnimatePresence mode="wait" initial={false}>
          {signing ? (
            <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
              <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="grid">
                  <LoaderCircle size={26} strokeWidth={2.4} />
                </motion.span>
              </span>
              <p className="text-[15px] font-semibold text-ink">Ждём подпись в eGov mobile</p>
            </motion.div>
          ) : (
            <motion.div key="ask" exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }} className="flex flex-col gap-4">
              <p className="text-[15px] leading-relaxed text-ink">Ваш ответ «{choice}». Откроется eGov mobile: подпишите бюллетень своей ЭЦП и вернитесь в приложение.</p>
              <p className="flex items-start gap-2 rounded-[14px] bg-surface-2 p-3 text-[13.5px] leading-snug text-ink-2">
                <Lock size={16} strokeWidth={2} className="mt-0.5 shrink-0" /> После подписи изменить голос нельзя: бюллетень юридически значим.
              </p>
              <Btn full className="!h-14 !text-[16px]" onClick={() => setSigning(true)}><ExternalLink size={17} strokeWidth={2.2} /> Открыть eGov mobile</Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </Sheet>
    </>
  )
}
