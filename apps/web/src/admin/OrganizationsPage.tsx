import type { CreateOrganizationRequest, Organization } from '@ortaq/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { post } from '../shared/api/client';
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

export function OrganizationsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const orgs = usePaged<Organization>(['admin', 'organizations'], '/admin/organizations', {
    search: search.trim() || undefined,
  });

  return (
    <>
      <PageHeader
        title={t('admin.organizationsTitle')}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
            {t('admin.newOrganization')}
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search size={18} className="pointer-events-none absolute top-3 left-3 text-text-tertiary" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t('common.search')}: ${t('admin.orgName')}, ${t('admin.bin')}`}
          className="h-11 w-full rounded-md border border-border-default bg-bg-surface pr-3 pl-10 outline-none focus:border-border-focus"
        />
      </div>
      {orgs.isLoading ? (
        <PageSpinner />
      ) : orgs.items.length === 0 ? (
        <EmptyState icon={<Landmark size={24} />} title={t('admin.noOrganizations')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orgs.items.map((o) => (
            <Card key={o.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-h3 font-semibold">{o.name}</p>
                  <p className="mt-1 text-body-sm text-text-secondary">
                    {t(`admin.form_${o.management_form}`)} · {t('admin.bin')}{' '}
                    <span className="tabular">{o.bin}</span>
                  </p>
                  <p className="mt-1 truncate text-body-sm text-text-secondary">{o.legal_address}</p>
                </div>
                <Badge tone={o.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {t(`admin.status_${o.status}`)}
                </Badge>
              </div>
              <Link
                to={`/admin/houses?organization_id=${o.id}`}
                className="mt-4 inline-block text-label font-medium text-text-link"
              >
                {t('admin.housesCount')}: {o.house_count}
              </Link>
            </Card>
          ))}
        </div>
      )}
      {orgs.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={orgs.isFetchingNextPage}
            onClick={() => void orgs.fetchNextPage()}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
      <Modal open={creating} title={t('admin.newOrganization')} onClose={() => setCreating(false)}>
        <OrganizationForm onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}

function OrganizationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateOrganizationRequest>({
    name: '',
    bin: '',
    management_form: 'OSI',
    legal_address: '',
  });
  const create = useMutation({
    mutationFn: (body: CreateOrganizationRequest) => post<Organization>('/admin/organizations', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      onDone();
    },
  });
  const set = (k: keyof CreateOrganizationRequest) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate(form);
      }}
    >
      <Input label={t('admin.orgName')} required value={form.name} onChange={set('name')} />
      <Input
        label={t('admin.bin')}
        required
        inputMode="numeric"
        maxLength={12}
        value={form.bin}
        onChange={set('bin')}
        className="tabular"
      />
      <Select
        label={t('admin.managementForm')}
        value={form.management_form}
        onChange={set('management_form')}
      >
        <option value="OSI">{t('admin.form_OSI')}</option>
        <option value="PT">{t('admin.form_PT')}</option>
      </Select>
      <Input
        label={t('admin.legalAddress')}
        required
        value={form.legal_address}
        onChange={set('legal_address')}
      />
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
