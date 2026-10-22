import { PipeTransform } from '@nestjs/common'
import type { z } from 'zod'
import { ErrorCode } from '@ortaq/shared'
import { AppError } from './errors'

/** Проверка тела запроса схемой из @ortaq/shared — той же, что у клиента */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value ?? {})
    if (parsed.success) return parsed.data
    const fields = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    throw new AppError(400, ErrorCode.VALIDATION, 'Проверьте поля формы', { fields })
  }
}
