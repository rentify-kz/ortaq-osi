import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Sparkles, BookOpen, Send, Scale, Vote } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Field, TextArea, type Go } from '../../components/web/ui'
import { ease } from '../../lib/cn'

/* Ответы прототипа собраны только из статей, на которые ссылается docs/:
   ст. 42, 43, 44 и ст. 50 п. 3 Закона «О жилищных отношениях».
   На всё остальное помощник честно говорит, что основания не нашёл. */

type Answer = {
  verdict: string
  body: string[]
  cites: { title: string; about: string }[]
  action?: { label: string; to: string }
}
type Message = { id: number; q: string; a?: Answer }

const LAW = 'Закон «О жилищных отношениях»'

const answers: { test: RegExp; a: Answer }[] = [
  {
    test: /капремонт|капитальн/i,
    a: {
      verdict: 'Нет, без решения собрания нельзя.',
      body: [
        'Деньги со сберегательного счёта на капитальный ремонт тратятся только по решению общего собрания собственников.',
        'Замена лифта относится к капитальному ремонту общего имущества. Нужно квалифицированное большинство: 2/3 голосов при кворуме более 50% площади.',
      ],
      cites: [
        { title: `${LAW}, статья 42`, about: 'Общее собрание: кворум и порядок принятия решений' },
        { title: `${LAW}, статья 50, пункт 3`, about: 'Расходование средств на капитальный ремонт' },
      ],
      action: { label: 'Создать голосование по этому вопросу', to: 'Новое голосование' },
    },
  },
  {
    test: /голос.*счита|счита.*голос|площад|кворум/i,
    a: {
      verdict: 'По площади помещений, а не по числу людей.',
      body: [
        'Каждый собственник голосует долей, равной площади его помещения в общей площади дома. Собрание правомочно, если проголосовали собственники более 50% площади.',
        'Поэтому голосование нельзя начать, пока у всех помещений не указана площадь.',
      ],
      cites: [{ title: `${LAW}, статья 42`, about: 'Общее собрание: созыв, кворум, порядок принятия решений' }],
      action: { label: 'Проверить площади помещений', to: 'Жильцы' },
    },
  },
  {
    test: /онлайн|электрон|дистанц|приложени|без очного/i,
    a: {
      verdict: 'Да, голосование можно провести электронно.',
      body: [
        'Закон допускает голосование через объекты информатизации. Обязательное условие: каждый голосующий собственник идентифицирован, в Ortaq это подпись через eGov mobile.',
        'Для тех, кто не пользуется приложением, есть письменный опрос с бумажными бюллетенями.',
      ],
      cites: [
        { title: `${LAW}, статья 44`, about: 'Голосование через объекты информатизации' },
        { title: `${LAW}, статья 43`, about: 'Письменный опрос' },
      ],
      action: { label: 'Перейти к голосованиям', to: 'Голосования' },
    },
  },
]

const fallback: Answer = {
  verdict: 'Не нашёл статьи, которая прямо отвечает на этот вопрос.',
  body: [
    'Я отвечаю только со ссылкой на закон, а юридический ответ без источника хуже никакого. Попробуйте переформулировать вопрос или уточните у юриста.',
  ],
  cites: [],
}

const suggestions = [
  'Можно ли потратить деньги с капремонта на замену лифта без собрания?',
  'Как считаются голоса на собрании?',
  'Можно ли провести голосование онлайн, без очного собрания?',
]

const answerFor = (q: string) => answers.find((x) => x.test.test(q))?.a ?? fallback

/** Пауза перед ответом, чтобы было видно, что помощник ищет статьи */
const THINK_MS = 900

/* ───────────── сообщения ───────────── */

function AnswerBlock({ a, go }: { a: Answer; go: Go }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex max-w-[680px] flex-col gap-3 rounded-[20px] bg-brand-50 p-5"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-700">
        <Sparkles size={15} strokeWidth={2.2} /> Помощник
      </p>
      <p className="font-display text-[17px] font-bold leading-snug text-ink">{a.verdict}</p>
      {a.body.map((p) => <p key={p} className="text-[14.5px] leading-relaxed text-ink">{p}</p>)}

      {a.cites.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {a.cites.map((c) => (
            <div key={c.title} className="flex items-start gap-3 rounded-[14px] bg-surface px-3.5 py-2.5">
              <BookOpen size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-brand-600" />
              <span>
                <span className="block text-[14px] font-semibold text-ink">{c.title}</span>
                <span className="block text-[12.5px] text-ink-2">{c.about}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {a.action && (
        <div className="pt-1">
          <Btn onClick={() => go(a.action!.to)}><Vote size={15} strokeWidth={2.2} /> {a.action.label}</Btn>
        </div>
      )}
    </motion.div>
  )
}

function Thinking() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 rounded-[20px] bg-brand-50 px-5 py-4 text-[14px] text-brand-700" aria-live="polite">
      <Sparkles size={15} strokeWidth={2.2} /> Ищу в законе
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-brand-500"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </motion.div>
  )
}

/* ───────────── экран ───────────── */

export function Assistant({ go }: { go: Go }) {
  const [messages, setMessages] = useState<Message[]>([{ id: 1, q: suggestions[0], a: answerFor(suggestions[0]) }])
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const busy = messages.some((m) => !m.a)

  useEffect(() => {
    if (!busy) return
    const t = setTimeout(() => {
      setMessages((ms) => ms.map((m) => (m.a ? m : { ...m, a: answerFor(m.q) })))
    }, THINK_MS)
    return () => clearTimeout(t)
  }, [busy])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const ask = (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setMessages((ms) => [...ms, { id: Date.now(), q: text }])
    setDraft('')
  }

  return (
    <>
      <PageHead title="Юридический помощник" sub="Отвечает по Закону «О жилищных отношениях». Каждый ответ со ссылкой на статью" />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card delay={0.08} lift={false} className="flex flex-col gap-5 xl:col-span-8">
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-3">
                <motion.p
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                  className="max-w-[560px] self-end rounded-[20px] bg-surface-2 px-4 py-3 text-[15px] leading-relaxed text-ink"
                >
                  {m.q}
                </motion.p>
                <AnimatePresence mode="wait">
                  {m.a ? <AnswerBlock key="a" a={m.a} go={go} /> : <Thinking key="t" />}
                </AnimatePresence>
              </div>
            ))}
            <div ref={end} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(draft) }} className="flex flex-col gap-2">
            <Field label="Ваш вопрос">
              <TextArea value={draft} onChange={setDraft} rows={2} placeholder="Например: нужно ли собрание, чтобы поменять подрядчика по уборке?" />
            </Field>
            <div className="flex justify-end">
              <Btn type="submit" disabled={!draft.trim() || busy}><Send size={15} strokeWidth={2.2} /> Спросить</Btn>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-4 xl:sticky xl:top-[92px] xl:col-span-4">
          <Card delay={0.15} lift={false} className="flex flex-col gap-3">
            <CardHead title="Частые вопросы" />
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="rounded-[16px] bg-surface-2 px-4 py-3 text-left text-[14px] leading-snug text-ink transition-colors hover:bg-brand-50 disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </Card>
          <Card delay={0.22} lift={false} className="flex items-start gap-3 bg-surface-2 !p-4">
            <Scale size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-2" />
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              Помощник не заменяет юриста. В спорных случаях, особенно с судом и должниками, проверьте ответ у специалиста.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
