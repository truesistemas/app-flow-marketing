import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Workflow,
  Users,
  Settings,
  Plug,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/dashboard',
  },
  {
    icon: Megaphone,
    label: 'Campanhas',
    path: '/campaigns',
  },
  {
    icon: Workflow,
    label: 'Flows',
    path: '/flows',
  },
  {
    icon: Users,
    label: 'Contatos',
    path: '/contacts',
  },
];

const settingsItems: MenuItem[] = [
  {
    icon: Plug,
    label: 'Integrações',
    path: '/settings/integrations',
  },
  {
    icon: Settings,
    label: 'Configurações',
    path: '/settings',
  },
];

export default function Sidebar() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="w-64 glass-effect border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Flow Marketing
        </h1>
        {user?.organization && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {user.organization.name}
          </p>
        )}
      </div>

      {/* Menu Principal */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Separador */}
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            Configurações
          </p>
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}






