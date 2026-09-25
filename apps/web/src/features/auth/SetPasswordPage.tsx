import type { PasswordLoginResponse } from '@ortaq/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { post } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/errors';
import { Alert, Button, Input } from '../../shared/ui';
import { AuthShell } from './AuthShell';
import { TotpStep } from './TotpStep';

/** Установка пароля по ссылке из письма → обязательная настройка второго фактора. */
export function SetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [step, setStep] = useState<PasswordLoginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = repeat.length > 0 && repeat !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return;
    setBusy(true);
    setError(null);
    try {
      setStep(
        await post<PasswordLoginResponse>('/auth/password/set', { token, password }, { noRefresh: true }),
      );
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (step) {
    const setup = step.next === 'TOTP_SETUP';
    return (
      <AuthShell title={setup ? t('auth.setupTitle') : t('auth.totpTitle')}>
        <TotpStep
          challenge={step.challenge_token}
          mode={setup ? 'setup' : 'verify'}
          onDone={async () => {
            await qc.invalidateQueries({ queryKey: ['me'] });
            navigate('/', { replace: true });
          }}
        />
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell title={t('auth.setPasswordTitle')}>
        <Alert>{t('auth.invalidLink')}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.setPasswordTitle')} subtitle={t('auth.setPasswordHint')}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('auth.newPassword')}
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label={t('auth.repeatPassword')}
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={mismatch ? t('auth.passwordsDiffer') : null}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block loading={busy} disabled={password.length < 12 || password !== repeat}>
          {t('common.continue')}
        </Button>
      </form>
    </AuthShell>
  );
}
