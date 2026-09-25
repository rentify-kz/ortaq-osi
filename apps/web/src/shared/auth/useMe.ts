import type { MeResponse } from '@ortaq/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, get } from '../api/client';

/** Текущий пользователь; null — не вошёл. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await get<MeResponse>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}
