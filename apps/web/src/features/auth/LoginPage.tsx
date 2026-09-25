import type { PasswordLoginResponse } from '@ortaq/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { post } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/errors';
import { Alert, Button, Input } from '../../shared/ui';
import { AuthShell } from './AuthShell';
import { TotpStep } from './TotpStep';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<PasswordLoginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStep(
        await post<PasswordLoginResponse>('/auth/password/login', { email, password }, { noRefresh: true }),
      );
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    navigate('/', { replace: true });
  };

  if (step) {
    const setup = step.next === 'TOTP_SETUP';
    return (
      <AuthShell title={setup ? t('auth.setupTitle') : t('auth.totpTitle')}>
        <TotpStep challenge={step.challenge_token} mode={setup ? 'setup' : 'verify'} onDone={done} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block loading={busy}>
          {t('auth.signIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
