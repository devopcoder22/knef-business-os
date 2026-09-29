'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Monitor,
  Package,
  Warehouse,
  Truck,
  Users,
  UserSquare,
  Banknote,
  Receipt,
  UserCog,
  CheckSquare,
  Target,
  BarChart3,
  Bot,
  Plug,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permission?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sales', href: '/sales', icon: ShoppingCart, permission: PERMISSIONS.SALES.VIEW },
  { label: 'POS', href: '/pos', icon: Monitor, permission: PERMISSIONS.POS.ACCESS },
  { label: 'Products', href: '/products', icon: Package, permission: PERMISSIONS.PRODUCTS.VIEW },
  { label: 'Inventory', href: '/inventory', icon: Warehouse, permission: PERMISSIONS.INVENTORY.VIEW },
  { label: 'Purchasing', href: '/purchasing', icon: Truck, permission: PERMISSIONS.PURCHASING.VIEW },
  { label: 'Customers', href: '/customers', icon: Users, permission: PERMISSIONS.CUSTOMERS.VIEW },
  { label: 'Suppliers', href: '/suppliers', icon: UserSquare, permission: PERMISSIONS.PURCHASING.MANAGE_SUPPLIERS },
  { label: 'Finance', href: '/finance', icon: Banknote, permission: PERMISSIONS.FINANCE.VIEW },
  { label: 'Expenses', href: '/expenses', icon: Receipt, permission: PERMISSIONS.FINANCE.MANAGE_EXPENSES },
  { label: 'Staff', href: '/staff', icon: UserCog, permission: PERMISSIONS.STAFF.VIEW },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, permission: PERMISSIONS.TASKS.VIEW },
  { label: 'Goals', href: '/goals', icon: Target, permission: PERMISSIONS.GOALS.VIEW },
  { label: 'Reports', href: '/reports', icon: BarChart3, permission: PERMISSIONS.REPORTS.VIEW },
  { label: 'AI Assistant', href: '/ai', icon: Bot, permission: PERMISSIONS.AI.ACCESS },
  { label: 'Integrations', href: '/integrations', icon: Plug, permission: PERMISSIONS.SETTINGS.MANAGE_INTEGRATIONS },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings, permission: PERMISSIONS.SETTINGS.VIEW },
  { label: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission, clearAuth } = useAuthStore();

  const isAdmin = user?.roles?.some((r) =>
    ['SUPER_ADMIN', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER'].includes(r),
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const canSee = (item: NavItem): boolean => {
    if (item.adminOnly) return !!isAdmin;
    if (!item.permission) return true;
    return hasPermission(item.permission);
  };

  return (
    <aside
      className={cn(
        'h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 relative',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 p-4 border-b border-slate-700', collapsed && 'justify-center')}>
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
          <span className="text-white font-black text-lg">K</span>
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-sm leading-tight">KNEF Gadgets</p>
            <p className="text-xs text-slate-400">Business OS</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:bg-slate-600 z-10"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {NAV_ITEMS.filter(canSee).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(item.href)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Bottom items */}
      <div className="border-t border-slate-700 py-3 px-2 space-y-0.5">
        {BOTTOM_ITEMS.filter(canSee).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(item.href)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} className="flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {/* User info + logout */}
        <div className={cn('flex items-center gap-3 px-3 py-2 mt-2', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white uppercase">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => clearAuth()}
              className="text-slate-400 hover:text-white"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
