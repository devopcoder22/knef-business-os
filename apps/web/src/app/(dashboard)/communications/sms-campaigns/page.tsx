'use client';

import { useState } from 'react';
import { MessageSquare, Plus, Send, Users } from 'lucide-react';

export default function SmsCampaignsPage() {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', message: '', recipients: 'all' });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Send bulk SMS messages to your customer segments</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={14} />
          New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Campaigns', value: '0', icon: MessageSquare, color: 'blue' },
          { label: 'Messages Sent', value: '0', icon: Send, color: 'green' },
          { label: 'Customers Reached', value: '0', icon: Users, color: 'purple' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-100`}>
              <Icon size={18} className={`text-${color}-600`} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">All Campaigns</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
            <MessageSquare size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No campaigns yet</p>
          <p className="text-xs text-gray-400 mt-1">Create your first SMS campaign to reach your customers</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus size={13} /> Create Campaign
          </button>
        </div>
      </div>

      {/* New campaign modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">New SMS Campaign</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. New Year Promo"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
              <select
                value={form.recipients}
                onChange={(e) => setForm(f => ({ ...f, recipients: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Customers</option>
                <option value="recent">Recent Customers (last 30 days)</option>
                <option value="vip">VIP / High-value Customers</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                rows={4}
                maxLength={160}
                placeholder="Your SMS message (max 160 characters)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{form.message.length}/160</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">SMS campaigns require Termii API to be configured in <strong>SMS Providers</strong> and your Sender ID to be approved.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowNew(false); setForm({ name: '', message: '', recipients: 'all' }); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 text-sm rounded-lg cursor-not-allowed"
              >
                Send Campaign (Coming Soon)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
