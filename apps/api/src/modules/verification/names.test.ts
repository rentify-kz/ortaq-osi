import { describe, expect, it } from 'vitest'
import { maskIin, namesMatch, titleCaseName } from './names'

describe('namesMatch', () => {
  it('matches a full name regardless of case and ё', () => {
    expect(namesMatch('СЕМЁНОВА АЛИЯ БОЛАТОВНА', 'Семенова Алия Болатовна')).toBe(true)
  })

  it('accepts initials and a missing patronymic in the registry', () => {
    expect(namesMatch('АСАНОВ ДАНИЯР АЙДАРОВИЧ', 'Асанов Д.А.')).toBe(true)
    expect(namesMatch('АСАНОВ ДАНИЯР АЙДАРОВИЧ', 'Асанов Данияр')).toBe(true)
    expect(namesMatch('КИМ ВИКТОРИЯ', 'Ким В.')).toBe(true)
  })

  it('handles Kazakh letters', () => {
    expect(namesMatch('ӘБІЛҚАЙЫР ҰЛАН', 'Әбілқайыр Ұлан')).toBe(true)
  })

  it('rejects a different surname or a wrong initial', () => {
    expect(namesMatch('АСАНОВА ДИНАРА', 'Асанов Д.')).toBe(false)
    expect(namesMatch('АСАНОВ ДАНИЯР', 'Асанов Б.')).toBe(false)
    expect(namesMatch('АСАНОВ ДАНИЯР', 'Асанов Данияр Айдарович')).toBe(false)
    expect(namesMatch('', 'Асанов')).toBe(false)
  })
})

describe('titleCaseName', () => {
  it('turns certificate capitals into a readable name', () => {
    expect(titleCaseName('АСАНОВ  ДАНИЯР-ХАН')).toBe('Асанов Данияр-Хан')
    expect(titleCaseName('ӘБІЛҚАЙЫР ҰЛАН')).toBe('Әбілқайыр Ұлан')
  })
})

describe('maskIin', () => {
  it('keeps only the last four digits', () => {
    expect(maskIin('900101300126')).toBe('•••• •••• 0126')
  })
})
