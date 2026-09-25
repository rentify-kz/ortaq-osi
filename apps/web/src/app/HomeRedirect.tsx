import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useMe } from '../shared/auth/useMe';
import { EmptyState, PageSpinner } from '../shared/ui';

/** Председатель сразу попадает в свой дом (04 §3, шаг 7); админ — в админ-панель. */
export function HomeRedirect() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  if (isLoading) return <PageSpinner />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.is_platform_admin) return <Navigate to="/admin/houses" replace />;
  const first = me.memberships[0];
  if (first) return <Navigate to={`/houses/${first.house_id}`} replace />;
  return (
    <EmptyState icon={<Home size={24} />} title={t('house.noHousesTitle')} text={t('house.noHousesText')} />
  );
}
