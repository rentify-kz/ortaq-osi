import type { StepUpResponse } from '@ortaq/shared';
import { ShieldCheck } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { post, rememberStepUp, setStepUpHandler } from '../api/client';
import { errorMessage } from '../api/errors';
import { Alert, Button, Input, Modal } from '../ui';

/**
 * Перехватывает 428 от API: показывает запрос кода, получает step-up токен и повторяет запрос
 * (docs/spec/13-security.md §2). Токен живёт 5 минут и переиспользуется для следующих действий.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((token: string | null) => void) | null>(null);

  useEffect(() => {
    setStepUpHandler(
      () =>
        new Promise((resolve) => {
          resolver.current = resolve;
          setCode('');
          setError(null);
          setOpen(true);
        }),
    );
    return () => setStepUpHandler(null);
  }, []);

  const finish = (token: string | null) => {
    resolver.current?.(token);
    resolver.current = null;
    setOpen(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<StepUpResponse>('/auth/step-up', { method: 'TOTP', code }, { noRefresh: true });
      rememberStepUp(res.step_up_token, res.expires_at);
      finish(res.step_up_token);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      <Modal open={open} title={t('auth.stepUpTitle')} onClose={() => finish(null)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-3 rounded-md bg-bg-accent-subtle p-3 text-body-sm text-text-secondary">
            <ShieldCheck className="shrink-0 text-accent-600" size={20} />
            {t('auth.stepUpHint')}
          </div>
          <Input
            label={t('auth.totpCode')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className="tabular"
          />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => finish(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              {t('common.confirm')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
