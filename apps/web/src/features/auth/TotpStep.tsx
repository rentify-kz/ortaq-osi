import type { SessionResponse, TotpSetupResponse } from '@ortaq/shared';
import { KeyRound, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, post } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/errors';
import { Alert, Button, Input, Spinner } from '../../shared/ui';

/** Ввод кода TOTP. В режиме setup сначала показывает QR для подключения аутентификатора. */
export function TotpStep({
  challenge,
  mode,
  onDone,
}: {
  challenge: string;
  mode: 'verify' | 'setup';
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'setup') return;
    let cancelled = false;
    post<TotpSetupResponse>('/auth/2fa/setup', { challenge_token: challenge }, { noRefresh: true })
      .then(async (res) => {
        const qr = await QRCode.toDataURL(res.otpauth_url, {
          margin: 1,
          width: 200,
          color: { dark: '#0F1711' },
        });
        if (!cancelled) setSetup({ secret: res.secret, qr });
      })
      .catch((e) => !cancelled && setError(errorMessage(t, e)));
    return () => {
      cancelled = true;
    };
  }, [challenge, mode, t]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post<SessionResponse>(
        '/auth/2fa/verify',
        { challenge_token: challenge, code },
        { noRefresh: true },
      );
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'INVALID_TOTP' ? t('auth.totpReused') : errorMessage(t, err),
      );
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {mode === 'setup' && (
        <>
          <p className="rounded-md bg-bg-accent-subtle p-3 text-body-sm text-text-secondary">
            {t('auth.setupWhy')}
          </p>
          <ol className="space-y-3 text-body">
            <li className="flex gap-3">
              <Smartphone size={20} className="mt-0.5 shrink-0 text-accent-600" />
              {t('auth.setupStep1')}
            </li>
            <li className="flex gap-3">
              <KeyRound size={20} className="mt-0.5 shrink-0 text-accent-600" />
              {t('auth.setupStep2')}
            </li>
          </ol>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle p-4">
            {setup ? (
              <>
                <img src={setup.qr} alt="QR" width={200} height={200} />
                <div className="text-center">
                  <p className="text-caption text-text-secondary">{t('auth.setupSecret')}</p>
                  <code className="text-body-sm font-medium tracking-wider">
                    {setup.secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                </div>
              </>
            ) : (
              !error && <Spinner />
            )}
          </div>
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={mode === 'setup' ? t('auth.setupStep3') : t('auth.totpHint')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="tabular"
        />
        {error && <Alert>{error}</Alert>}
        <Button
          type="submit"
          block
          loading={busy}
          disabled={code.length !== 6 || (mode === 'setup' && !setup)}
        >
          {t('common.confirm')}
        </Button>
      </form>
    </div>
  );
}
