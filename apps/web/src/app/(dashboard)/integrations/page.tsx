'use client';

import Link from 'next/link';
import { ShoppingBag, ArrowRight, Plug } from 'lucide-react';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-500 text-sm mt-1">
          Connect your store to external platforms and services
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/integrations/shopify"
          className="bg-white rounded-xl border border-gray-200 p-5 hover:border-green-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Shopify</h3>
              <p className="text-xs text-gray-400">GraphQL Admin API 2026-10</p>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </div>
          <p className="text-sm text-gray-600">
            Sync products, inventory, and orders between KNEF and your Shopify store.
          </p>
        </Link>

        <Link
          href="/integrations/connections"
          className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Plug size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Connections</h3>
              <p className="text-xs text-gray-400">Google · Meta · TikTok · Shopify</p>
            </div>
            <ArrowRight size={16} className="ml-auto text-gray-300" />
          </div>
          <p className="text-sm text-gray-600">
            Manage OAuth connections to external platforms and services.
          </p>
        </Link>
      </div>
    </div>
  );
}
