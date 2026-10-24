/** Разбор ФИО для сверки сертификата ЭЦП с реестром собственников */
function tokens(name: string): string[] {
  return name
    .normalize('NFC')
    .toUpperCase()
    .replaceAll('Ё', 'Е')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Совпадает ли ФИО из реестра с ФИО из сертификата. Реестр часто ведут с инициалами
 * («Асанов Д.А.») и без отчества, поэтому: фамилия — точно, остальное — целиком или
 * по первой букве. Несовпадение не отказ, а повод показать председателю (смена фамилии).
 */
export function namesMatch(certName: string, registryName: string): boolean {
  const cert = tokens(certName)
  const reg = tokens(registryName)
  if (cert.length === 0 || reg.length === 0 || cert[0] !== reg[0]) return false
  return reg.slice(1).every((part, i) => {
    const full = cert[i + 1]
    if (!full) return false
    return part.length === 1 ? full.startsWith(part) : full === part
  })
}

/** «АСАНОВ ДАНИЯР-ХАН» → «Асанов Данияр-Хан»: в сертификатах ФИО прописными */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
    .replace(/\s+/g, ' ')
}

/** ИИН на экране: только последние четыре цифры */
export function maskIin(iin: string): string {
  return `•••• •••• ${iin.slice(-4)}`
}
