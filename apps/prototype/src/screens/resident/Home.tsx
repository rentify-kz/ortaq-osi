import { motion } from 'motion/react'
import { Vote as VoteIcon, ArrowRight, Sparkles, ChevronRight, Plus, Pin, Check, CircleAlert } from 'lucide-react'
import { Scroll, Block, Group, Label, Btn, Stepper } from '../../components/Bits'
import { useResident, RHead } from './state'
import { VoteScreen } from './Vote'
import { me, residentNews } from '../../data/resident'
import { activeVote } from '../../data/chairman'
import { ease, money } from '../../lib/cn'

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }
const pinned = residentNews.find((n) => n.pinned)

export function RHome() {
  const { views, setView, go, charges, vote, requests } = useResident()
  if (views.home === 'vote') return <VoteScreen />

  const due = charges.filter((c) => c.status !== 'checking')
  const total = due.reduce((s, c) => s + c.amount, 0)
  const overdue = due.some((c) => c.status === 'overdue')
  const active = requests.filter((r) => r.status !== 'done')

  return (
    <>
      <RHead title={<>С возвращением, <span className="text-ink-3">{me.short}</span></>} />
      <Scroll>
        {/* Блок действий скрывается целиком, если ничего не требуется */}
        {(due.length > 0 || !vote) && (
          <Group>
            <Label tone="warn">Требует вашего участия</Label>

            {due.length > 0 && (
              <motion.div variants={rise} className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand-500 to-brand-700 p-4">
                <div className="relative flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-white/80">Взносы за {due.map((c) => c.period).join(' и ')}</p>
                  {overdue && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white">
                      <CircleAlert size={12} strokeWidth={2.4} /> есть просрочка
                    </span>
                  )}
                </div>
                <p className="nums relative mt-3 font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] text-white">
                  {money(total)}<span className="ml-1 text-[21px] font-bold text-white/55">₸</span>
                </p>
                <Btn variant="ghost" full className="relative mt-3.5 !h-12" onClick={() => go(2, 'fin', 'mine')}>
                  Оплатить через Kaspi <ArrowRight size={16} strokeWidth={2.4} />
                </Btn>
              </motion.div>
            )}

            {!vote && (
              <Block>
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                    <VoteIcon size={19} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] font-bold leading-snug text-ink">{activeVote.title}</p>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">Осталось {activeVote.left}, нужно 2/3 голосов</p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-surface-3">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${activeVote.turnout}%` }}
                          transition={{ delay: 0.5, duration: 0.9, ease }}
                          className="h-full rounded-full bg-brand-500"
                        />
                      </div>
                      <span className="nums text-[13px] font-semibold text-ink-2">42%</span>
                    </div>
                  </div>
                </div>
                <Btn full className="mt-3.5 !h-12" onClick={() => setView('home', 'vote')}>Проголосовать</Btn>
              </Block>
            )}
          </Group>
        )}

        {vote && (
          <Block className="flex items-center gap-3 bg-brand-50 text-[14.5px] text-brand-700">
            <Check size={18} strokeWidth={2.6} className="shrink-0" />
            <span>Ваш голос «{vote.choice}» по замене лифта учтён</span>
          </Block>
        )}

        {active.length > 0 && (
          <Group>
            <Label>Сейчас решается</Label>
            {active.map((r) => {
              const done = r.stages.filter((s) => s.state === 'done').length
              const now = r.stages.find((s) => s.state === 'now')
              return (
                <motion.button key={r.id} variants={rise} onClick={() => go(1, 'req', { name: 'track', id: r.id })} className="w-full rounded-[22px] bg-surface p-4 text-left">
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold text-ink">{r.title}</span>
                      <span className="block text-[13.5px] text-ink-2">{r.place}</span>
                    </span>
                    <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
                  </span>
                  <span className="mt-3 block"><Stepper total={r.stages.length} done={done} /></span>
                  <span className="mt-2 block text-[13.5px] text-ink-2">
                    Сейчас: <span className="font-semibold text-brand-700">{now?.title ?? 'проверяется председателем'}</span>
                  </span>
                </motion.button>
              )
            })}
          </Group>
        )}

        <motion.button variants={rise} onClick={() => go(1, 'req', { name: 'new' })} className="flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Plus size={20} strokeWidth={2.4} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold text-ink">Сообщить о проблеме</span>
            <span className="block text-[13.5px] text-ink-2">Займёт минуту, можно с фото</span>
          </span>
        </motion.button>

        {/* Сводку пишет ИИ по понедельникам: ответ на «непонятно, что делает ОСИ» */}
        <motion.div variants={rise} className="rounded-[22px] bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-brand-700"><Sparkles size={15} strokeWidth={2.2} /> За неделю</p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink">
            Отремонтировали козырёк над 1 подъездом, провели дезинсекцию подвала, заменили лампы в подъездах. Собрано 87% взносов.
          </p>
        </motion.div>

        {pinned && (
          <Group>
            <Label>Объявления</Label>
            <motion.button variants={rise} onClick={() => go(3, 'more', 'news')} className="flex w-full items-start gap-3 rounded-[22px] bg-surface p-4 text-left">
              <Pin size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug text-ink">{pinned.title}</span>
                <span className="block text-[13px] text-ink-2">{pinned.when}</span>
              </span>
              <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
            </motion.button>
          </Group>
        )}
      </Scroll>
    </>
  )
}
