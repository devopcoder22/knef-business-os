'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  Clock,
  Package,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = ['Info', 'Contacts', 'Purchase History'] as const;
type Tab = (typeof TABS)[number];

interface Contact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  taxId: string | null;
  paymentTerms: number;
  currency: string;
  bankName: string | null;
  bankAccount: string | null;
  bankCode: string | null;
  notes: string | null;
  rating: number | null;
  isActive: boolean;
  contacts: Contact[];
  _count: { purchaseOrders: number; invoices: number };
}

interface PurchaseOrderRow {
  id: string;
  reference: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  createdAt: string;
  _count: { items: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-purple-100 text-purple-700',
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Info');
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const { data: supplier, isLoading } = useQuery<Supplier>({
    queryKey: ['supplier', id],
    queryFn: async () => {
      const res = await api().get<Supplier>(`/suppliers/${id}`);
      return res.data;
    },
  });

  const { data: history } = useQuery<PurchaseOrderRow[]>({
    queryKey: ['supplier-history', id],
    queryFn: async () => {
      const res = await api().get<PurchaseOrderRow[]>(`/suppliers/${id}/purchase-history`);
      return res.data;
    },
    enabled: activeTab === 'Purchase History',
  });

  const addContactMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/suppliers/${id}/contacts`, {
        name: contactName,
        title: contactTitle || undefined,
        email: contactEmail || undefined,
        phone: contactPhone || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      setShowAddContact(false);
      setContactName('');
      setContactTitle('');
      setContactEmail('');
      setContactPhone('');
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await api().delete(`/suppliers/${id}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-100 rounded w-1/3 animate-pulse" />
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!supplier) return <div>Supplier not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
            <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {supplier.code}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                supplier.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
              )}
            >
              {supplier.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <Link
          href={`/purchasing/orders/new?supplierId=${supplier.id}`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New PO
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Purchase Orders', value: supplier._count.purchaseOrders, icon: Package },
          { label: 'Invoices', value: supplier._count.invoices, icon: Package },
          { label: 'Payment Terms', value: `${supplier.paymentTerms}d`, icon: Clock },
          {
            label: 'Rating',
            value: supplier.rating ? `${supplier.rating}/5` : 'N/A',
            icon: Star,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-5 py-3 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              )}
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
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={14} className="text-gray-400" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-gray-400" />
                    <span>{supplier.email}</span>
                  </div>
                )}
                {(supplier.city || supplier.state || supplier.address) && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={14} className="text-gray-400 mt-0.5" />
                    <span>
                      {[supplier.address, supplier.city, supplier.state, supplier.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Banking</h3>
                {supplier.bankName && (
                  <div className="text-sm">
                    <p className="font-medium">{supplier.bankName}</p>
                    <p className="text-gray-500 font-mono">{supplier.bankAccount}</p>
                    {supplier.bankCode && <p className="text-gray-400 text-xs">Code: {supplier.bankCode}</p>}
                  </div>
                )}
                {supplier.taxId && (
                  <div className="text-sm">
                    <p className="text-gray-500">TIN: {supplier.taxId}</p>
                  </div>
                )}
              </div>
              {supplier.notes && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{supplier.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Contacts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Contacts</h3>
                <button
                  onClick={() => setShowAddContact(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus size={14} />
                  Add Contact
                </button>
              </div>

              {showAddContact && (
                <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Name *"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Title"
                      value={contactTitle}
                      onChange={(e) => setContactTitle(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => addContactMutation.mutate()}
                      disabled={!contactName || addContactMutation.isPending}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addContactMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      onClick={() => setShowAddContact(false)}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {supplier.contacts.length === 0 && !showAddContact && (
                <p className="text-sm text-gray-400 text-center py-8">No contacts added yet</p>
              )}

              {supplier.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-start justify-between p-3 border border-gray-200 rounded-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{contact.name}</p>
                      {contact.isPrimary && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    {contact.title && <p className="text-xs text-gray-500">{contact.title}</p>}
                    <div className="flex gap-3 mt-1">
                      {contact.phone && (
                        <span className="text-xs text-gray-500">{contact.phone}</span>
                      )}
                      {contact.email && (
                        <span className="text-xs text-gray-500">{contact.email}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeContactMutation.mutate(contact.id)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Purchase History' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Reference</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Total</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Paid</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Items</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).map((po) => (
                    <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <Link
                          href={`/purchasing/orders/${po.id}`}
                          className="text-blue-600 hover:underline font-mono text-xs"
                        >
                          {po.reference}
                        </Link>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            STATUS_COLORS[po.status] ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {Number(po.totalAmount).toLocaleString('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                        })}
                      </td>
                      <td className="py-2 px-3 text-right text-green-600">
                        {Number(po.paidAmount).toLocaleString('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                        })}
                      </td>
                      <td className="py-2 px-3 text-right">{po._count.items}</td>
                      <td className="py-2 px-3 text-right text-gray-500 text-xs">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(!history || history.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                        No purchase orders
                      </td>
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
