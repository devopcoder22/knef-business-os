'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Shield,
  Building2,
  MapPin,
  Flag,
  Bot,
  Webhook,
  Key,
  Plug,
  CheckSquare,
  FileText,
  ShieldAlert,
  Activity,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
}

const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Roles', href: '/admin/roles', icon: Shield },
  { label: 'Departments', href: '/admin/departments', icon: Building2 },
  { label: 'Locations', href: '/admin/locations', icon: MapPin },
  { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag },
  { label: 'AI Config', href: '/admin/ai', icon: Bot },
  { label: 'AI Autonomy', href: '/settings/ai-autonomy', icon: Bot, external: true },
  { label: 'External Agents', href: '/admin/agents', icon: Webhook },
  { label: 'API Keys', href: '/admin/api-keys', icon: Key },
  { label: 'Integrations', href: '/admin/integrations', icon: Plug },
  { label: 'Business Rules', href: '/admin/business-rules', icon: Scale },
  { label: 'Approvals', href: '/admin/approvals', icon: CheckSquare },
  { label: 'Audit Logs', href: '/admin/audit', icon: FileText },
  { label: 'Security', href: '/admin/security', icon: ShieldAlert },
  { label: 'System Health', href: '/admin/health', icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasPermission } = useAuthStore();

  if (!hasPermission(PERMISSIONS.ADMIN.MANAGE_USERS)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield size={40} className="mx-auto mb-3 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700">Access Denied</h2>
          <p className="text-sm text-gray-500 mt-1">
            You do not have permission to access the admin panel.
          </p>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex gap-6 min-h-full">
      <aside className="w-56 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-0">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Admin
            </h2>
          </div>
          <nav className="p-2 space-y-0.5">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href + (item.external ? '-ext' : '')}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive(item.href) && !item.external
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <item.icon size={15} className="flex-shrink-0" />
                <span>{item.label}</span>
                {item.external && (
                  <span className="ml-auto text-gray-300 text-xs">↗</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
