import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Валидация входа zod-схемой из @ortaq/shared: контракт описан один раз для API и клиентов. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    return this.schema.parse(value);
  }
}
