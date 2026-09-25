import type { HouseDetails } from '@ortaq/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ChecklistItem } from '../../admin/Checklist';
import { get } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/errors';
import { Alert, Badge, Card, PageHeader, PageSpinner } from '../../shared/ui';

/**
 * Первый экран председателя — чек-лист подготовки дома вместо пустого дашборда (04 §4).
 * Заполнение площадей, реестр и приглашения жильцов появятся в фазе 1.
 */
export function HouseHomePage() {
  const { t } = useTranslation();
  const { houseId = '' } = useParams();
  const house = useQuery({
    queryKey: ['house', houseId],
    queryFn: () => get<HouseDetails>(`/houses/${houseId}`),
  });

  if (house.isLoading) return <PageSpinner />;
  if (!house.data) return <Alert>{errorMessage(t, house.error)}</Alert>;
  const h = house.data;
  const missingAreas = h.areas_total - h.areas_filled;
  const done = [
    h.unit_count > 0,
    true,
    missingAreas === 0 && h.areas_total > 0,
    h.registry_uploaded,
    false,
  ].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title={h.display_name}
        subtitle={
          <span className="flex items-center gap-2">
            <Building2 size={16} />
            {h.address} · {t('house.entrancesUnits', { entrances: h.entrance_count, units: h.unit_count })}
          </span>
        }
        actions={<Badge tone="accent">{t(`roles.${h.my_role}`)}</Badge>}
      />
      {h.my_role === 'CHAIRMAN' && (
        <Card className="max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-h2 font-semibold">{t('house.prepareTitle')}</h2>
            <span className="tabular text-body-sm text-text-secondary">{done} / 5</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            <ChecklistItem done={h.unit_count > 0} label={t('house.unitsCreated')} value={h.unit_count} />
            <ChecklistItem done label={t('house.chairmanAssigned')} />
            <ChecklistItem
              done={missingAreas === 0 && h.areas_total > 0}
              label={t('house.areas')}
              value={`${h.areas_filled} / ${h.areas_total}`}
            />
            <ChecklistItem
              done={h.registry_uploaded}
              label={t('house.registry')}
              value={h.registry_uploaded ? undefined : t('admin.registryNotUploaded')}
            />
            <ChecklistItem done={false} label={t('house.residentsJoined')} value={0} />
          </ul>
          {missingAreas > 0 && (
            <div className="mt-4 flex gap-2 rounded-md bg-warning-bg p-3 text-body-sm text-warning">
              <TriangleAlert size={18} className="shrink-0" />
              {t('house.votingBlocked', { count: missingAreas })}
            </div>
          )}
          <p className="mt-4 text-body-sm text-text-tertiary">{t('house.nextPhase')}</p>
        </Card>
      )}
    </>
  );
}
