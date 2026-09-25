import type { AssignChairmanRequest, EntranceLayout, House, HouseReadiness, Unit } from '@ortaq/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, RefreshCw, TriangleAlert, UserMinus, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { del, get, post } from '../shared/api/client';
import { errorMessage } from '../shared/api/errors';
import { Alert, Badge, Button, Card, Input, Modal, PageHeader, PageSpinner } from '../shared/ui';
import { ChecklistItem } from './Checklist';
import { usePaged } from './usePaged';

export function HouseAdminPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const house = useQuery({
    queryKey: ['admin', 'house', id],
    queryFn: () => get<House>(`/admin/houses/${id}`),
  });
  const readiness = useQuery({
    queryKey: ['admin', 'house', id, 'readiness'],
    queryFn: () => get<HouseReadiness>(`/admin/houses/${id}/readiness`),
  });

  if (house.isLoading || readiness.isLoading) return <PageSpinner />;
  if (!house.data || !readiness.data) return <Alert>{errorMessage(t, house.error ?? readiness.error)}</Alert>;
  const h = house.data;
  const r = readiness.data;

  return (
    <>
      <Link
        to="/admin/houses"
        className="mb-4 inline-flex items-center gap-1 text-label text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        {t('common.back')}
      </Link>
      <PageHeader title={h.display_name} subtitle={`${h.organization_name} · ${h.address}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-2 text-h2 font-semibold">{t('admin.readiness')}</h2>
          <ul className="divide-y divide-border-subtle">
            <ChecklistItem done={r.units_generated} label={t('admin.unitsGenerated')} value={h.unit_count} />
            <ChecklistItem done={r.chairman_assigned} label={t('admin.chairmanAssigned')} />
            <ChecklistItem done={r.chairman_activated} label={t('admin.chairmanActivated')} />
            <ChecklistItem
              done={r.areas_total > 0 && r.areas_filled === r.areas_total}
              label={t('admin.areasFilled')}
              value={`${r.areas_filled} / ${r.areas_total}`}
            />
            <ChecklistItem
              done={r.registry_uploaded}
              label={t('admin.registry')}
              value={r.registry_uploaded ? undefined : t('admin.registryNotUploaded')}
            />
            <ChecklistItem done={r.is_voting_ready} label={t('admin.votingReady')} />
          </ul>
          {r.blocking_issues.length > 0 && (
            <div className="mt-4 rounded-md bg-warning-bg p-3 text-body-sm text-warning">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <TriangleAlert size={16} />
                {t('admin.blockingIssues')}
              </p>
              <ul className="list-disc pl-6">
                {r.blocking_issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <ChairmanCard houseId={id} readiness={r} />
      </div>
      <UnitsCard house={h} />
    </>
  );
}

function ChairmanCard({ houseId, readiness }: { houseId: string; readiness: HouseReadiness }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<AssignChairmanRequest>({ email: '', full_name: '' });
  const [sent, setSent] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'house', houseId] });

  const assign = useMutation({
    mutationFn: (body: AssignChairmanRequest) =>
      post<{ invite_sent: boolean }>(`/admin/houses/${houseId}/chairman`, body),
    onSuccess: async (res) => {
      setSent(res.invite_sent);
      setForm({ email: '', full_name: '' });
      await refresh();
    },
  });
  const resend = useMutation({
    mutationFn: () => post(`/admin/houses/${houseId}/chairman/resend-invite`),
    onSuccess: () => setSent(true),
  });
  const revoke = useMutation({
    mutationFn: () => del(`/admin/houses/${houseId}/chairman`),
    onSuccess: refresh,
  });
  const error = assign.error ?? resend.error ?? revoke.error;
  const c = readiness.chairman;

  return (
    <Card>
      <h2 className="mb-4 text-h2 font-semibold">{t('admin.chairman')}</h2>
      {c ? (
        <div className="space-y-4">
          <div className="rounded-md bg-bg-subtle p-4">
            <p className="text-h3 font-semibold">{c.full_name}</p>
            <p className="text-body-sm text-text-secondary">{c.email}</p>
            <div className="mt-2">
              {c.activated ? (
                <Badge tone="success">{t('admin.chairmanActivated')}</Badge>
              ) : (
                <Badge tone="warning">{t('admin.chairmanPending')}</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!c.activated && (
              <Button
                variant="secondary"
                icon={<Mail size={18} />}
                loading={resend.isPending}
                onClick={() => resend.mutate()}
              >
                {t('admin.resendInvite')}
              </Button>
            )}
            <Button
              variant="danger"
              icon={<UserMinus size={18} />}
              loading={revoke.isPending}
              onClick={() => window.confirm(t('admin.revokeConfirm')) && revoke.mutate()}
            >
              {t('admin.revokeChairman')}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            assign.mutate(form);
          }}
        >
          <Input
            label={t('admin.chairmanEmail')}
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={t('admin.fullName')}
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Button type="submit" icon={<UserPlus size={18} />} loading={assign.isPending}>
            {t('admin.assignChairman')}
          </Button>
        </form>
      )}
      {sent && (
        <div className="mt-4">
          <Alert tone="success">{t('admin.chairmanInviteSent')}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert>{errorMessage(t, error)}</Alert>
        </div>
      )}
    </Card>
  );
}

function UnitsCard({ house }: { house: House }) {
  const { t } = useTranslation();
  const [regenerating, setRegenerating] = useState(false);
  const units = usePaged<Unit>(['admin', 'house', house.id, 'units'], `/admin/houses/${house.id}/units`, {
    limit: '100',
  });

  return (
    <Card className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2 font-semibold">
          {t('admin.unitsTitle')} <span className="tabular text-text-tertiary">{house.unit_count}</span>
        </h2>
        <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setRegenerating(true)}>
          {t('admin.regenerate')}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="text-caption text-text-secondary">
            <tr className="border-b border-border-subtle">
              <th className="py-2 pr-4 font-medium">{t('admin.unitNumber')}</th>
              <th className="py-2 pr-4 font-medium">{t('admin.entrance')}</th>
              <th className="py-2 pr-4 font-medium">{t('admin.floor')}</th>
              <th className="py-2 pr-4 text-right font-medium">{t('admin.area')}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {units.items.map((u) => (
              <tr key={u.id} className="border-b border-border-subtle last:border-0">
                <td className="py-2 pr-4 font-medium">{u.number}</td>
                <td className="py-2 pr-4">{u.entrance ?? '—'}</td>
                <td className="py-2 pr-4">{u.floor ?? '—'}</td>
                <td className="py-2 pr-4 text-right">
                  {u.area ?? <span className="text-text-tertiary">{t('admin.notSet')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {units.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={units.isFetchingNextPage}
            onClick={() => void units.fetchNextPage()}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
      <Modal open={regenerating} title={t('admin.regenerate')} onClose={() => setRegenerating(false)}>
        <RegenerateForm house={house} onDone={() => setRegenerating(false)} />
      </Modal>
    </Card>
  );
}

function RegenerateForm({ house, onDone }: { house: House; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rows, setRows] = useState<EntranceLayout[]>(() => {
    const per = Math.ceil(house.unit_count / house.entrance_count);
    return Array.from({ length: house.entrance_count }, (_, i) => ({
      entrance: i + 1,
      from: i * per + 1,
      to: Math.min((i + 1) * per, house.unit_count),
      floors: house.floor_count ?? undefined,
    }));
  });
  const run = useMutation({
    mutationFn: () =>
      post<House>(`/admin/houses/${house.id}/generate-units`, { strategy: 'SEQUENTIAL', entrances: rows }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'house', house.id] });
      onDone();
    },
  });
  const update = (i: number, k: keyof EntranceLayout, v: string) =>
    setRows(
      rows.map((r, j) => (j === i ? { ...r, [k]: v === '' && k === 'floors' ? undefined : Number(v) } : r)),
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      <Alert tone="warning">{t('admin.regenerateWarning')}</Alert>
      <p className="text-label font-medium">{t('admin.layout')}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2">
            <Input
              label={t('admin.entrance')}
              type="number"
              min={1}
              value={r.entrance}
              onChange={(e) => update(i, 'entrance', e.target.value)}
            />
            <Input
              label={t('admin.layoutFrom')}
              type="number"
              min={1}
              value={r.from}
              onChange={(e) => update(i, 'from', e.target.value)}
            />
            <Input
              label={t('admin.layoutTo')}
              type="number"
              min={1}
              value={r.to}
              onChange={(e) => update(i, 'to', e.target.value)}
            />
            <Input
              label={t('admin.floors')}
              type="number"
              min={1}
              value={r.floors ?? ''}
              onChange={(e) => update(i, 'floors', e.target.value)}
            />
            <button
              type="button"
              className="mb-2 rounded-sm p-2 text-text-secondary hover:bg-bg-subtle"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              aria-label="×"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="text"
        onClick={() => {
          const last = rows[rows.length - 1];
          const from = last ? last.to + 1 : 1;
          setRows([...rows, { entrance: (last?.entrance ?? 0) + 1, from, to: from, floors: last?.floors }]);
        }}
      >
        {t('admin.addEntrance')}
      </Button>
      {run.error && <Alert>{errorMessage(t, run.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={run.isPending}>
          {t('admin.regenerate')}
        </Button>
      </div>
    </form>
  );
}
