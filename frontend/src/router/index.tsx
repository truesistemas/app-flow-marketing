import { createBrowserRouter, Navigate } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import CampaignList from '../pages/campaigns/CampaignList';
import CampaignCreate from '../pages/campaigns/CampaignCreate';
import CampaignEdit from '../pages/campaigns/CampaignEdit';
import CampaignDetail from '../pages/campaigns/CampaignDetail';
import FlowList from '../pages/flows/FlowList';
import FlowBuilderPage from '../pages/flows/FlowBuilder';
import Integrations from '../pages/settings/Integrations';
import Profile from '../pages/settings/Profile';
import Organization from '../pages/settings/Organization';
import AppLayout from '../components/layout/AppLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'campaigns',
        children: [
          {
            index: true,
            element: <CampaignList />,
          },
          {
            path: 'new',
            element: <CampaignCreate />,
          },
          {
            path: ':id/edit',
            element: <CampaignEdit />,
          },
          {
            path: ':id',
            element: <CampaignDetail />,
          },
        ],
      },
      {
        path: 'flows',
        children: [
          {
            index: true,
            element: <FlowList />,
          },
          {
            path: 'new',
            element: <FlowBuilderPage />,
          },
          {
            path: ':id',
            element: <FlowBuilderPage />,
          },
        ],
      },
      {
        path: 'settings',
        children: [
          {
            path: 'integrations',
            element: <Integrations />,
          },
          {
            path: 'profile',
            element: <Profile />,
          },
          {
            path: 'organization',
            element: <Organization />,
          },
        ],
      },
    ],
  },
]);

