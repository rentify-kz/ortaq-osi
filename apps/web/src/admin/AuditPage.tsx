import type { AuditEntry } from '@ortaq/shared';
import { useMutation } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { get } from '../shared/api/client';
import { errorMessage } from '../shared/api/errors';
import { Alert, Button, Card, PageHeader, PageSpinner } from '../shared/ui';
import { usePaged } from './usePaged';

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Asia/Almaty',
});

export function AuditPage() {
  const { t } = useTranslation();
  const log = usePaged<AuditEntry>(['admin', 'audit'], '/admin/audit', { limit: '50' });
  const verify = useMutation({
    mutationFn: () =>
      get<{ intact: boolean; broken: { house_id: string | null; seq: string }[] }>('/admin/audit/verify'),
  });

  return (
    <>
      <PageHeader
        title={t('admin.auditTitle')}
        actions={
          <Button
            variant="secondary"
            icon={<ShieldCheck size={18} />}
            loading={verify.isPending}
            onClick={() => verify.mutate()}
          >
            {t('admin.verifyChain')}
          </Button>
        }
      />
      {verify.data && (
        <div className="mb-4">
          {verify.data.intact ? (
            <Alert tone="success">
              <span className="flex items-center gap-2">
                <ShieldCheck size={18} />
                {t('admin.chainIntact')}
              </span>
            </Alert>
          ) : (
            <Alert>
              <span className="flex items-center gap-2">
                <ShieldAlert size={18} />
                {t('admin.chainBroken')}: {verify.data.broken.map((b) => `#${b.seq}`).join(', ')}
              </span>
            </Alert>
          )}
        </div>
      )}
      {verify.error && <Alert>{errorMessage(t, verify.error)}</Alert>}
      {log.isLoading ? (
        <PageSpinner />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-body-sm">
            <thead className="text-caption text-text-secondary">
              <tr className="border-b border-border-subtle">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">{t('admin.time')}</th>
                <th className="px-5 py-3 font-medium">{t('admin.action')}</th>
                <th className="px-5 py-3 font-medium">{t('admin.entity')}</th>
                <th className="px-5 py-3 font-medium">{t('admin.actorRole')}</th>
              </tr>
            </thead>
            <tbody>
              {log.items.map((e) => (
                <tr key={e.id} className="border-b border-border-subtle last:border-0">
                  <td className="tabular px-5 py-2.5 text-text-tertiary">{e.seq}</td>
                  <td className="tabular px-5 py-2.5 whitespace-nowrap">
                    {dateFmt.format(new Date(e.created_at))}
                  </td>
                  <td className="px-5 py-2.5 font-medium">
                    <code>{e.action}</code>
                  </td>
                  <td className="px-5 py-2.5 text-text-secondary">{e.entity_type}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{e.actor_role ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {log.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}
