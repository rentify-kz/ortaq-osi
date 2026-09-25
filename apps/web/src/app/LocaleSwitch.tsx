import type { MeResponse } from '@ortaq/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { patch } from '../shared/api/client';
import { useMe } from '../shared/auth/useMe';
import { type AppLocale, applyLocale, LOCALES } from '../shared/i18n';

const LABEL: Record<AppLocale, string> = { ru: 'РУС', kk: 'ҚАЗ' };

/** Язык после входа сохраняется в профиле, до входа — только на время вкладки. */
export function LocaleSwitch() {
  const { i18n, t } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();

  const change = async (locale: AppLocale) => {
    applyLocale(locale);
    if (me) qc.setQueryData(['me'], await patch<MeResponse>('/me', { locale }));
  };

  return (
    <div role="group" aria-label={t('common.language')} className="flex rounded-full bg-bg-subtle p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => void change(l)}
          aria-pressed={i18n.language === l}
          className={`rounded-full px-3 py-1 text-caption font-medium ${i18n.language === l ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
