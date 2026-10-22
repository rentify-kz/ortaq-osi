import { createBrowserRouter, Navigate } from 'react-router'
import { Audit } from '../admin/Audit'
import { House } from '../admin/House'
import { Houses } from '../admin/Houses'
import { Organizations } from '../admin/Organizations'
import { Join } from '../auth/Join'
import { Login } from '../auth/Login'
import { SetPassword } from '../auth/SetPassword'
import { Home } from '../chairman/Home'
import { Residents } from '../chairman/Residents'
import { AdminRoute, HomeRedirect, HouseRoute, NoAccess, Root } from './routes'

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/login', element: <Login /> },
      { path: '/set-password', element: <SetPassword /> },
      { path: '/join', element: <Join /> },
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
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
