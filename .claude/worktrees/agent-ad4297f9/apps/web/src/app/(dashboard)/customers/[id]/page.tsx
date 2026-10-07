'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, MapPin, Star, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = ['Info', 'Sales History'] as const;
type Tab = (typeof TABS)[number];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
  PARTIAL_REFUND: 'bg-orange-100 text-orange-700',
};

interface Customer {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  altPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  dateOfBirth: string | null;
  gender: string | null;
  notes: string | null;
  loyaltyPoints: number;
  totalSpent: string;
  creditLimit: string;
  outstandingBalance: string;
  isActive: boolean;
  createdAt: string;
}

interface SalesOrder {
  id: string;
  reference: string;
  status: string;
  channel: string;
  totalAmount: string;
  paidAmount: string;
  createdAt: string;
  completedAt: string | null;
  _count: { items: number };
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('Info');

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ['customer', id],
    queryFn: async () => {
      const res = await api().get<Customer>(`/customers/${id}`);
      return res.data;
    },
  });

  const { data: salesHistory } = useQuery<SalesOrder[]>({
    queryKey: ['customer-sales-history', id],
    queryFn: async () => {
      const res = await api().get<SalesOrder[]>(`/customers/${id}/sales-history`);
      return res.data;
    },
    enabled: activeTab === 'Sales History',
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-100 rounded w-1/3" /></div>;
  if (!customer) return <div>Customer not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {customer.firstName} {customer.lastName}
            </h1>
            <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {customer.code}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', customer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {customer.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <Link
          href={`/sales/orders/new?customerId=${customer.id}`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <ShoppingCart size={16} />
          New Order
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Spent</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {Number(customer.totalSpent).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Loyalty Points</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{customer.loyaltyPoints.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Credit Limit</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {Number(customer.creditLimit).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {Number(customer.outstandingBalance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn('px-5 py-3 text-sm font-medium transition-colors', activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700')}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'Info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact</h3>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-gray-400" />
                  <span>{customer.phone}</span>
                </div>
                {customer.altPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={14} className="text-gray-400" />
                    <span className="text-gray-500">{customer.altPhone} (alt)</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-gray-400" />
                    <span>{customer.email}</span>
                  </div>
                )}
                {(customer.city || customer.address) && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={14} className="text-gray-400 mt-0.5" />
                    <span>{[customer.address, customer.city, customer.state, customer.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Personal</h3>
                {customer.dateOfBirth && (
                  <p className="text-sm text-gray-600">DOB: {new Date(customer.dateOfBirth).toLocaleDateString()}</p>
                )}
                {customer.gender && (
                  <p className="text-sm text-gray-600">Gender: {customer.gender}</p>
                )}
                <p className="text-sm text-gray-500">
                  Customer since: {new Date(customer.createdAt).toLocaleDateString()}
                </p>
              </div>
              {customer.notes && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{customer.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Sales History' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Reference</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Channel</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Total</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Paid</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Items</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesHistory ?? []).map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <Link href={`/sales/orders/${order.id}`} className="text-blue-600 hover:underline font-mono text-xs">
                          {order.reference}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{order.channel}</td>
                      <td className="py-2 px-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600')}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {Number(order.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                      </td>
                      <td className="py-2 px-3 text-right text-green-600">
                        {Number(order.paidAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                      </td>
                      <td className="py-2 px-3 text-right">{order._count.items}</td>
                      <td className="py-2 px-3 text-right text-gray-500 text-xs">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(!salesHistory || salesHistory.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">No sales history</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
