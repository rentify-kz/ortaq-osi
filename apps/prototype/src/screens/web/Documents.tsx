import { useState } from 'react'
import { Upload, Download, Check, PenLine, Eye, Lock, FileText } from 'lucide-react'
import { Card } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Segmented, Tag, Table, Row, Td, Cell, Empty, Search } from '../../components/web/ui'
import { documents, type DocKind } from '../../data/chairman'

type Filter = 'all' | DocKind

const kindLabel: Record<DocKind, string> = {
  report: 'Отчёт',
  protocol: 'Протокол',
  contract: 'Договор',
  act: 'Акт',
  other: 'Прочее',
}

export function Documents() {
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [signed, setSigned] = useState<string[]>([])

  const query = q.trim().toLowerCase()
  // Неподписанное всегда сверху: это единственное, что здесь требует действия
  const rows = documents
    .filter((d) => (f === 'all' || d.kind === f) && (!query || d.title.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.sign === 'unsigned' && !signed.includes(b.title)) - Number(a.sign === 'unsigned' && !signed.includes(a.title)))
  const count = (x: Filter) => documents.filter((d) => x === 'all' || d.kind === x).length

  return (
    <>
      <PageHead
        title="Документы"
        sub="Отчёты, протоколы и акты публикуются жильцам сами после подписи"
        actions={<Btn className="!rounded-full"><Upload size={16} strokeWidth={2.2} /> Загрузить</Btn>}
      />

      <Card delay={0.08} lift={false} className="flex flex-col gap-4 !p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            id="docs"
            value={f}
            onChange={setF}
            options={[
              { v: 'all', label: 'Все', n: count('all') },
              { v: 'report', label: 'Отчёты', n: count('report') },
              { v: 'protocol', label: 'Протоколы', n: count('protocol') },
              { v: 'act', label: 'Акты', n: count('act') },
              { v: 'contract', label: 'Договоры', n: count('contract') },
              { v: 'other', label: 'Прочее', n: count('other') },
            ]}
          />
          <Search value={q} onChange={setQ} label="Поиск документа" placeholder="Название документа" />
        </div>

        <Table
          cols={[{ label: 'Документ' }, { label: 'Тип' }, { label: 'Дата' }, { label: 'Кто видит' }, { label: 'Подпись', right: true }, { label: '', right: true }]}
          minW={820}
          empty={rows.length === 0 && <Empty icon={FileText} title="Ничего не нашлось" text="Попробуйте другое название или сбросьте фильтр." />}
        >
          {rows.map((d, i) => {
            const isSigned = d.sign === 'signed' || signed.includes(d.title)
            return (
              <Row key={d.title} i={i}>
                <Td><Cell title={d.title} sub={d.size} /></Td>
                <Td className="text-ink-2">{kindLabel[d.kind]}</Td>
                <Td className="nums text-ink-2">{d.date}</Td>
                <Td>
                  {d.access === 'public'
                    ? <span className="inline-flex items-center gap-1.5 text-ink"><Eye size={15} strokeWidth={2} className="text-ink-2" /> Жильцы</span>
                    : <span className="inline-flex items-center gap-1.5 text-ink-2"><Lock size={15} strokeWidth={2} /> Правление</span>}
                </Td>
                <Td right>
                  {d.sign === 'none' ? <span className="text-ink-3">не нужна</span>
                    : isSigned ? <Tag tone="brand" icon={Check}>ЭЦП</Tag>
                    : (
                      <Btn className="!h-9 !rounded-full !px-3.5 !text-[13px]" onClick={() => setSigned((s) => [...s, d.title])}>
                        <PenLine size={14} strokeWidth={2.2} /> Подписать
                      </Btn>
                    )}
                </Td>
                <Td right>
                  <button aria-label={`Скачать: ${d.title}`} className="grid size-9 place-items-center rounded-full bg-surface text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink">
                    <Download size={16} strokeWidth={2} />
                  </button>
                </Td>
              </Row>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
