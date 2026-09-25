import type { CreateHouseRequest, House, Organization, Page } from '@ortaq/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, ChevronRight, Plus, Vote } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { get, post } from '../shared/api/client';
import { errorMessage } from '../shared/api/errors';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
  Select,
} from '../shared/ui';
import { usePaged } from './usePaged';

export function HousesPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const organizationId = params.get('organization_id') ?? undefined;
  const [creating, setCreating] = useState(false);
  const houses = usePaged<House>(['admin', 'houses'], '/admin/houses', { organization_id: organizationId });

  return (
    <>
      <PageHeader
        title={t('admin.housesTitle')}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
            {t('admin.newHouse')}
          </Button>
        }
      />
      {houses.isLoading ? (
        <PageSpinner />
      ) : houses.items.length === 0 ? (
        <EmptyState icon={<Building size={24} />} title={t('admin.noHouses')} />
      ) : (
        <div className="space-y-3">
          {houses.items.map((h) => (
            <Link key={h.id} to={`/admin/houses/${h.id}`} className="block">
              <Card className="flex items-center gap-4 transition-shadow hover:shadow-md">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-600">
                  <Building size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-h3 font-semibold">{h.display_name}</p>
                  <p className="truncate text-body-sm text-text-secondary">
                    {h.organization_name} · {h.address}
                  </p>
                </div>
                <div className="hidden text-right text-body-sm text-text-secondary sm:block">
                  <span className="tabular">{h.unit_count}</span> {t('admin.units').toLowerCase()}
                </div>
                {h.is_voting_ready && (
                  <Badge tone="success">
                    <Vote size={14} className="mr-1" />
                    {t('admin.votingReady')}
                  </Badge>
                )}
                <ChevronRight size={20} className="text-text-tertiary" />
              </Card>
            </Link>
          ))}
        </div>
      )}
      {houses.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={houses.isFetchingNextPage}
            onClick={() => void houses.fetchNextPage()}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
      <Modal open={creating} title={t('admin.newHouse')} onClose={() => setCreating(false)}>
        <HouseForm defaultOrganizationId={organizationId} onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}

function HouseForm({
  defaultOrganizationId,
  onDone,
}: {
  defaultOrganizationId?: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgs = useQuery({
    queryKey: ['admin', 'organizations', 'all'],
    queryFn: () => get<Page<Organization>>('/admin/organizations?limit=100'),
  });
  const [form, setForm] = useState({
    organization_id: defaultOrganizationId ?? '',
    address: '',
    display_name: '',
    entrance_count: '1',
    unit_count: '',
    floor_count: '',
  });
  const create = useMutation({
    mutationFn: (body: CreateHouseRequest) => post<House>('/admin/houses', body),
    onSuccess: async (house) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'houses'] });
      onDone();
      navigate(`/admin/houses/${house.id}`);
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      organization_id: form.organization_id,
      address: form.address,
      display_name: form.display_name,
      entrance_count: Number(form.entrance_count),
      unit_count: Number(form.unit_count),
      floor_count: form.floor_count ? Number(form.floor_count) : undefined,
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Select
        label={t('admin.organization')}
        required
        value={form.organization_id}
        onChange={set('organization_id')}
      >
        <option value="">{t('admin.selectOrganization')}</option>
        {orgs.data?.items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <Input
        label={t('admin.displayName')}
        hint={t('admin.displayNameHint')}
        required
        value={form.display_name}
        onChange={set('display_name')}
      />
      <Input label={t('admin.address')} required value={form.address} onChange={set('address')} />
      <div className="grid grid-cols-3 gap-3">
        <Input
          label={t('admin.entrances')}
          type="number"
          min={1}
          required
          value={form.entrance_count}
          onChange={set('entrance_count')}
        />
        <Input
          label={t('admin.units')}
          type="number"
          min={1}
          required
          value={form.unit_count}
          onChange={set('unit_count')}
        />
        <Input
          label={t('admin.floors')}
          type="number"
          min={1}
          value={form.floor_count}
          onChange={set('floor_count')}
        />
      </div>
      <p className="text-body-sm text-text-secondary">{t('admin.unitsWillBeGenerated')}</p>
      {create.error && <Alert>{errorMessage(t, create.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t('common.create')}
        </Button>
      </div>
    </form>
  );
}
