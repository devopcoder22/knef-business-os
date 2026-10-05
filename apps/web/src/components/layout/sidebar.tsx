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
  ChevronDown,
  Tag,
  Smartphone,
  ArrowLeftRight,
  ClipboardList,
  ListOrdered,
  Globe,
  Mail,
  MessageSquare,
  Webhook,
  FileText,
  Server,
  BookOpen,
  Calendar,
  Map,
  Shield,
  Building2,
  MapPin,
  Flag,
  KeyRound,
  ShieldAlert,
  Activity,
  BrainCircuit,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  adminOnly?: boolean;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Sales',
    href: '/sales',
    icon: ShoppingCart,
    permission: PERMISSIONS.SALES.VIEW,
    children: [
      { label: 'Orders', href: '/sales/orders', icon: ShoppingCart, permission: PERMISSIONS.SALES.VIEW },
      { label: 'Invoices', href: '/sales/invoices', icon: Receipt, permission: PERMISSIONS.SALES.VIEW },
      { label: 'Receipts', href: '/sales/receipts', icon: Receipt, permission: PERMISSIONS.SALES.VIEW },
    ],
  },
  { label: 'POS', href: '/pos', icon: Monitor, permission: PERMISSIONS.POS.ACCESS },
  {
    label: 'Products',
    href: '/products',
    icon: Package,
    permission: PERMISSIONS.PRODUCTS.VIEW,
    children: [
      { label: 'Products', href: '/products', icon: Package, permission: PERMISSIONS.PRODUCTS.VIEW },
      { label: 'Categories', href: '/categories', icon: Tag, permission: PERMISSIONS.PRODUCTS.VIEW },
      { label: 'Brands', href: '/brands', icon: ListOrdered, permission: PERMISSIONS.PRODUCTS.VIEW },
      { label: 'IMEI / Serials', href: '/serialized-units', icon: Smartphone, permission: PERMISSIONS.PRODUCTS.VIEW },
    ],
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: Warehouse,
    permission: PERMISSIONS.INVENTORY.VIEW,
    children: [
      { label: 'Stock Levels', href: '/inventory', icon: Warehouse, permission: PERMISSIONS.INVENTORY.VIEW },
      { label: 'Transfers', href: '/inventory/transfers', icon: ArrowLeftRight, permission: PERMISSIONS.INVENTORY.TRANSFER },
      { label: 'Adjustments', href: '/inventory/adjustments', icon: ClipboardList, permission: PERMISSIONS.INVENTORY.ADJUST },
      { label: 'Stock Count', href: '/inventory/counts', icon: CheckSquare, permission: PERMISSIONS.INVENTORY.COUNT },
    ],
  },
  {
    label: 'Purchasing',
    href: '/purchasing',
    icon: Truck,
    permission: PERMISSIONS.PURCHASING.VIEW,
    children: [
      { label: 'Orders', href: '/purchasing/orders', icon: ClipboardList, permission: PERMISSIONS.PURCHASING.VIEW },
      { label: 'Receipts', href: '/purchasing/receipts', icon: CheckSquare, permission: PERMISSIONS.PURCHASING.RECEIVE },
    ],
  },
  { label: 'Customers', href: '/customers', icon: Users, permission: PERMISSIONS.CUSTOMERS.VIEW },
  { label: 'Suppliers', href: '/suppliers', icon: UserSquare, permission: PERMISSIONS.PURCHASING.MANAGE_SUPPLIERS },
  {
    label: 'Finance',
    href: '/finance',
    icon: Banknote,
    permission: PERMISSIONS.FINANCE.VIEW,
    children: [
      { label: 'Dashboard', href: '/finance', icon: BarChart3, permission: PERMISSIONS.FINANCE.VIEW },
      { label: 'Bank Accounts', href: '/finance/bank-accounts', icon: Banknote, permission: PERMISSIONS.FINANCE.BANK_ACCOUNTS },
      { label: 'Expenses', href: '/finance/expenses', icon: Receipt, permission: PERMISSIONS.FINANCE.EXPENSES.VIEW },
      { label: 'Tax Rates', href: '/finance/tax-rates', icon: ListOrdered, permission: PERMISSIONS.FINANCE.MANAGE },
    ],
  },
  {
    label: 'Staff',
    href: '/staff',
    icon: UserCog,
    permission: PERMISSIONS.STAFF.VIEW,
    children: [
      { label: 'Employees', href: '/staff', icon: UserCog, permission: PERMISSIONS.STAFF.VIEW },
      { label: 'Departments', href: '/departments', icon: Users, permission: PERMISSIONS.STAFF.MANAGE },
    ],
  },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, permission: PERMISSIONS.TASKS.VIEW },
  { label: 'Goals', href: '/goals', icon: Target, permission: PERMISSIONS.GOALS.VIEW },
  {
    label: 'Planner',
    href: '/planner',
    icon: Map,
    permission: PERMISSIONS.PLANNER.VIEW,
    children: [
      { label: 'My Day', href: '/planner', icon: Calendar, permission: PERMISSIONS.PLANNER.VIEW },
      { label: 'Plans', href: '/planner/plans', icon: ClipboardList, permission: PERMISSIONS.PLANNER.VIEW },
    ],
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: Calendar,
    permission: PERMISSIONS.CALENDAR.VIEW,
    children: [
      { label: 'My Calendar', href: '/calendar', icon: Calendar, permission: PERMISSIONS.CALENDAR.VIEW },
      { label: 'Settings', href: '/calendar/settings', icon: Settings, permission: PERMISSIONS.CALENDAR.MANAGE_CONNECTIONS },
    ],
  },
  {
    label: 'Intelligence',
    href: '/business-intelligence',
    icon: BrainCircuit,
    permission: PERMISSIONS.REPORTS.VIEW,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    permission: PERMISSIONS.REPORTS.VIEW,
    children: [
      { label: 'Overview', href: '/reports', icon: BarChart3, permission: PERMISSIONS.REPORTS.VIEW },
      { label: 'Sales', href: '/reports/sales', icon: ShoppingCart, permission: PERMISSIONS.REPORTS.VIEW },
      { label: 'Inventory', href: '/reports/inventory', icon: Warehouse, permission: PERMISSIONS.REPORTS.VIEW },
      { label: 'Purchasing', href: '/reports/purchasing', icon: Truck, permission: PERMISSIONS.REPORTS.VIEW },
      { label: 'Finance', href: '/reports/finance', icon: Banknote, permission: PERMISSIONS.REPORTS.VIEW },
      { label: 'Staff', href: '/reports/staff', icon: UserCog, permission: PERMISSIONS.REPORTS.VIEW },
    ],
  },
  {
    label: 'AI',
    href: '/ai',
    icon: Bot,
    permission: PERMISSIONS.AI.ACCESS,
    children: [
      { label: 'AI Hub', href: '/ai', icon: Bot, permission: PERMISSIONS.AI.ACCESS },
      { label: 'Chat', href: '/ai/chat', icon: MessageSquare, permission: PERMISSIONS.AI.CHAT },
      { label: 'Providers', href: '/ai/providers', icon: Server, permission: PERMISSIONS.AI.PROVIDERS },
      { label: 'Knowledge Base', href: '/ai/knowledge', icon: BookOpen, permission: PERMISSIONS.AI.KNOWLEDGE },
      { label: 'Usage', href: '/ai/usage', icon: BarChart3, permission: PERMISSIONS.AI.USAGE },
      { label: 'Tools', href: '/ai/tools', icon: ClipboardList, permission: PERMISSIONS.AI.TOOLS },
      { label: 'Approvals', href: '/ai/approvals', icon: CheckSquare, permission: PERMISSIONS.AI.APPROVALS },
      { label: 'Agents', href: '/ai/agents', icon: Bot, permission: PERMISSIONS.AI.AGENTS },
    ],
  },
  {
    label: 'Channels',
    href: '/ecommerce',
    icon: Globe,
    permission: PERMISSIONS.ECOMMERCE.MANAGE,
    children: [
      { label: 'E-commerce', href: '/ecommerce', icon: Globe, permission: PERMISSIONS.ECOMMERCE.MANAGE },
      { label: 'Integrations', href: '/integrations', icon: Plug, permission: PERMISSIONS.INTEGRATIONS.MANAGE },
    ],
  },
  {
    label: 'Communications',
    href: '/communications',
    icon: Mail,
    permission: PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS,
    children: [
      { label: 'Email Providers', href: '/communications/email-providers', icon: Mail, permission: PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS },
      { label: 'Campaigns', href: '/communications/campaigns', icon: MessageSquare, permission: PERMISSIONS.COMMUNICATIONS.CAMPAIGNS },
      { label: 'Templates', href: '/communications/templates', icon: FileText, permission: PERMISSIONS.COMMUNICATIONS.TEMPLATES },
      { label: 'Subscriptions', href: '/communications/subscriptions', icon: Users, permission: PERMISSIONS.COMMUNICATIONS.SUBSCRIPTIONS },
      { label: 'Telegram', href: '/communications/telegram', icon: MessageSquare, permission: PERMISSIONS.COMMUNICATIONS.TELEGRAM },
      { label: 'Webhooks', href: '/communications/webhooks', icon: Webhook, permission: PERMISSIONS.COMMUNICATIONS.WEBHOOKS },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings, permission: PERMISSIONS.SETTINGS.VIEW },
  {
    label: 'Admin',
    href: '/admin',
    icon: ShieldCheck,
    adminOnly: true,
    children: [
      { label: 'Overview', href: '/admin', icon: LayoutDashboard, adminOnly: true },
      { label: 'Users', href: '/admin/users', icon: Users, adminOnly: true },
      { label: 'Roles', href: '/admin/roles', icon: Shield, adminOnly: true },
      { label: 'Departments', href: '/admin/departments', icon: Building2, adminOnly: true },
      { label: 'Locations', href: '/admin/locations', icon: MapPin, adminOnly: true },
      { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag, adminOnly: true },
      { label: 'External Agents', href: '/admin/agents', icon: Webhook, adminOnly: true },
      { label: 'API Keys', href: '/admin/api-keys', icon: KeyRound, adminOnly: true },
      { label: 'Approvals', href: '/admin/approvals', icon: CheckSquare, adminOnly: true },
      { label: 'Audit Logs', href: '/admin/audit', icon: FileText, adminOnly: true },
      { label: 'Security', href: '/admin/security', icon: ShieldAlert, adminOnly: true },
      { label: 'System Health', href: '/admin/health', icon: Activity, adminOnly: true },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function NavItemComponent({
  item,
  collapsed,
  isActive,
  canSee,
  depth = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: (href: string) => boolean;
  canSee: (item: NavItem) => boolean;
  depth?: number;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isGroupActive = hasChildren && item.children!.some((c) => isActive(c.href));
  const [expanded, setExpanded] = useState(isGroupActive);

  if (!canSee(item)) return null;

  if (hasChildren && !collapsed) {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            isGroupActive
              ? 'bg-blue-600/20 text-blue-300'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white',
          )}
        >
          <item.icon size={18} className="flex-shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown
            size={14}
            className={cn('transition-transform', expanded ? 'rotate-180' : '')}
          />
        </button>
        {expanded && (
          <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700 space-y-0.5">
            {item.children!.filter(canSee).map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isActive(child.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                )}
              >
                <child.icon size={15} className="flex-shrink-0" />
                <span>{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
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
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasPermission, clearAuth } = useAuthStore();

  const isAdmin = user?.roles?.some((r) =>
    ['SUPER_ADMIN', 'MANAGING_DIRECTOR', 'GENERAL_MANAGER'].includes(r),
  );

  const isActive = (href: string) => {
    // Exact match for root module pages to avoid matching children as root active
    if (href === '/inventory') return pathname === '/inventory';
    if (href === '/products') return pathname === '/products';
    if (href === '/sales') return pathname === '/sales';
    if (href === '/purchasing') return pathname === '/purchasing';
    if (href === '/ecommerce') return pathname === '/ecommerce';
    if (href === '/ai') return pathname === '/ai';
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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
        {NAV_ITEMS.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={isActive}
            canSee={canSee}
          />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="border-t border-slate-700 py-3 px-2 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={isActive}
            canSee={canSee}
          />
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
