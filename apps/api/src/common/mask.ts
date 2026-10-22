/** Маска телефона в списках: председателю достаточно узнать человека, полный номер не нужен */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return d.length < 4 ? '•••' : `+${d.slice(0, 1)} ${d.slice(1, 4)} ••• •• ${d.slice(-2)}`
}
