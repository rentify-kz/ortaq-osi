import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuditPage } from '../admin/AuditPage';
import { HouseAdminPage } from '../admin/HouseAdminPage';
import { HousesPage } from '../admin/HousesPage';
import { OrganizationsPage } from '../admin/OrganizationsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SetPasswordPage } from '../features/auth/SetPasswordPage';
import { HouseHomePage } from '../features/house/HouseHomePage';
import { ApiError } from '../shared/api/client';
import { StepUpProvider } from '../shared/stepup/StepUpProvider';
import { EmptyState } from '../shared/ui';
import { AppLayout } from './AppLayout';
import { HomeRedirect } from './HomeRedirect';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  const { t } = useTranslation();
  return <EmptyState icon="404" title={t('common.notFound')} />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/houses/:houseId', element: <HouseHomePage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin',
    element: <AppLayout adminOnly />,
    children: [
      { index: true, element: <HousesPage /> },
      { path: 'organizations', element: <OrganizationsPage /> },
      { path: 'houses', element: <HousesPage /> },
      { path: 'houses/:id', element: <HouseAdminPage /> },
      { path: 'audit', element: <AuditPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StepUpProvider>
        <RouterProvider router={router} />
      </StepUpProvider>
    </QueryClientProvider>
  );
}
