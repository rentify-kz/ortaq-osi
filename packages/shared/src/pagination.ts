import { z } from 'zod';

/** Курсорная пагинация — docs/spec/01-architecture.md §9. */
export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof PageQuery>;

export function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), next_cursor: z.string().nullable() });
}
export type Page<T> = { items: T[]; next_cursor: string | null };
