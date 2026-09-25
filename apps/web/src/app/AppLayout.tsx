import { useQueryClient } from '@tanstack/react-query';
import { Building, ClipboardList, Home, Landmark, LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router';
import { clearStepUp, post, setSessionExpiredHandler } from '../shared/api/client';
import { useMe } from '../shared/auth/useMe';
import { applyLocale } from '../shared/i18n';
import { PageSpinner } from '../shared/ui';
import { LocaleSwitch } from './LocaleSwitch';
import { Logo } from './Logo';

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-label font-medium ${isActive ? 'bg-accent-50 text-accent-700' : 'text-text-secondary hover:bg-bg-subtle'}`;

/** Оболочка для вошедших пользователей. Без сессии — на страницу входа. */
export function AppLayout({ adminOnly = false }: { adminOnly?: boolean }) {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { houseId } = useParams();

  useEffect(() => {
    if (me) applyLocale(me.locale);
  }, [me]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      qc.setQueryData(['me'], null);
      navigate('/login', { replace: true });
    });
    return () => setSessionExpiredHandler(null);
  }, [qc, navigate]);

  if (isLoading) return <PageSpinner />;
  if (!me) return <Navigate to="/login" replace />;
  if (adminOnly && !me.is_platform_admin) return <Navigate to="/" replace />;

  const logout = async () => {
    await post('/auth/logout').catch(() => undefined);
    clearStepUp();
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg-subtle">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {me.is_platform_admin && (
              <>
                <NavLink to="/admin/organizations" className={navCls}>
                  <Landmark size={18} />
                  {t('nav.organizations')}
                </NavLink>
                <NavLink to="/admin/houses" className={navCls}>
                  <Building size={18} />
                  {t('nav.houses')}
                </NavLink>
                <NavLink to="/admin/audit" className={navCls}>
                  <ClipboardList size={18} />
                  {t('nav.audit')}
                </NavLink>
              </>
            )}
            {me.memberships.map((m) => (
              <NavLink key={m.house_id} to={`/houses/${m.house_id}`} className={navCls}>
                <Home size={18} />
                <span className="max-w-48 truncate">{m.house_display_name}</span>
              </NavLink>
            ))}
          </nav>
          <LocaleSwitch />
          <div className="hidden text-right sm:block">
            <p className="text-label font-medium">{me.full_name}</p>
            <p className="text-caption text-text-secondary">
              {me.is_platform_admin
                ? t('nav.admin')
                : houseId
                  ? t(`roles.${me.memberships.find((m) => m.house_id === houseId)?.role ?? 'RESIDENT'}`)
                  : me.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-md p-2 text-text-secondary hover:bg-bg-subtle"
            aria-label={t('common.logout')}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
