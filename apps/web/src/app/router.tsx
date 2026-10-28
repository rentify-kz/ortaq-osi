import { createBrowserRouter, Navigate } from 'react-router'
import { Audit } from '../admin/Audit'
import { House } from '../admin/House'
import { Houses } from '../admin/Houses'
import { Organizations } from '../admin/Organizations'
import { Join } from '../auth/Join'
import { Login } from '../auth/Login'
import { SetPassword } from '../auth/SetPassword'
import { Home } from '../chairman/Home'
import { Announcements } from '../chairman/Announcements'
import { Areas } from '../chairman/Areas'
import { Registry } from '../chairman/Registry'
import { Residents } from '../chairman/Residents'
import { Staff } from '../chairman/Staff'
import { Requests } from '../chairman/Requests'
import { RequestDetail } from '../chairman/RequestDetail'
import { Tasks } from '../chairman/Tasks'
import { Finance } from '../chairman/Finance'
import { DevEgov } from '../auth/DevEgov'
import { AdminRoute, HomeRedirect, HouseRoute, NoAccess, Root } from './routes'

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/login', element: <Login /> },
      { path: '/set-password', element: <SetPassword /> },
      { path: '/join', element: <Join /> },
      // Заглушка eGov mobile: в сборке для production маршрута нет
      ...(import.meta.env.DEV ? [{ path: '/dev/egov', element: <DevEgov /> }] : []),
      { path: '/no-access', element: <NoAccess /> },
      {
        path: '/admin',
        element: <AdminRoute />,
        children: [
          { index: true, element: <Navigate to="/admin/houses" replace /> },
          { path: 'houses', element: <Houses /> },
          { path: 'houses/:houseId', element: <House /> },
          { path: 'organizations', element: <Organizations /> },
          { path: 'audit', element: <Audit /> },
        ],
      },
      {
        path: '/h/:houseId',
        element: <HouseRoute />,
        children: [
          { index: true, element: <Home /> },
          { path: 'residents', element: <Residents /> },
          { path: 'registry', element: <Registry /> },
          { path: 'areas', element: <Areas /> },
          { path: 'announcements', element: <Announcements /> },
          { path: 'staff', element: <Staff /> },
          { path: 'requests', element: <Requests /> },
          { path: 'requests/:requestId', element: <RequestDetail /> },
          { path: 'tasks', element: <Tasks /> },
          { path: 'finance', element: <Finance /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
