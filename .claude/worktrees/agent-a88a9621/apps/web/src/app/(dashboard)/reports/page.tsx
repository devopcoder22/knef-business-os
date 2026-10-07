'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  ShoppingCart,
  Warehouse,
  Truck,
  Banknote,
  UserCog,
  ChevronRight,
  BarChart3,
} from 'lucide-react';

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6'];

const REPORT_CARDS = [
  {
    label: 'Sales Reports',
    description: 'Revenue trends, top products, customer analytics, and payment breakdowns.',
    icon: ShoppingCart,
    href: '/reports/sales',
    color: 'bg-indigo-100 text-indigo-600',
  },
  {
    label: 'Inventory Reports',
    description: 'Stock valuation, low-stock alerts, movement history, and turnover rates.',
    icon: Warehouse,
    href: '/reports/inventory',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    label: 'Purchasing Reports',
    description: 'Purchase order summaries and supplier performance analytics.',
    icon: Truck,
    href: '/reports/purchasing',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    label: 'Finance Reports',
    description: 'Profit & Loss statement, cash flow analysis, and expense breakdown.',
    icon: Banknote,
    href: '/reports/finance',
    color: 'bg-red-100 text-red-600',
  },
  {
    label: 'Staff Reports',
    description: 'Employee attendance tracking and workforce analytics.',
    icon: UserCog,
    href: '/reports/staff',
    color: 'bg-blue-100 text-blue-600',
  },
];

const DATE_PRESETS = [
  { label: 'Today', getValue: () => {
    const d = new Date().toISOString().slice(0, 10);
    return { startDate: d, endDate: d };
  }},
  { label: 'This Week', getValue: () => {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }},
  { label: 'This Month', getValue: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }},
  { label: 'This Quarter', getValue: () => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }},
  { label: 'This Year', getValue: () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }},
];

function ReportsHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePreset, setActivePreset] = useState<string>('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  function applyPreset(preset: (typeof DATE_PRESETS)[0]) {
    setActivePreset(preset.label);
    setShowCustom(false);
  }

  function buildHref(base: string) {
    const preset = DATE_PRESETS.find(p => p.label === activePreset);
    const dates = showCustom
      ? { startDate: customStart, endDate: customEnd }
      : preset?.getValue() ?? DATE_PRESETS[2].getValue();
    const params = new URLSearchParams({ startDate: dates.startDate, endDate: dates.endDate });
    return `${base}?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="text-indigo-600" size={24} />
          Reports & Analytics
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Business intelligence for KNEF Gadgets
        </p>
      </div>

      {/* Date Range Picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Quick Date Range</p>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePreset === preset.label && !showCustom
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => { setShowCustom(true); setActivePreset('Custom'); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showCustom
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Custom
          </button>
        </div>
        {showCustom && (
          <div className="flex gap-3 mt-3">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="self-center text-gray-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_CARDS.map(card => (
          <Link
            key={card.href}
            href={buildHref(card.href)}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
                <card.icon size={20} />
              </div>
              <ChevronRight
                size={18}
                className="text-gray-300 group-hover:text-indigo-500 transition-colors mt-1"
              />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mt-3">{card.label}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-snug">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function ReportsHubPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />}>
      <ReportsHubContent />
    </Suspense>
  );
}
