import type { Page } from '@ortaq/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { get } from '../shared/api/client';

/** Курсорная пагинация (01-architecture §9): «Показать ещё» догружает следующую страницу. */
export function usePaged<T>(key: unknown[], path: string, params: Record<string, string | undefined> = {}) {
  const q = useInfiniteQuery({
    queryKey: [...key, params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
      if (pageParam) search.set('cursor', pageParam);
      const qs = search.toString();
      return get<Page<T>>(`${path}${qs ? `?${qs}` : ''}`, signal);
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}
