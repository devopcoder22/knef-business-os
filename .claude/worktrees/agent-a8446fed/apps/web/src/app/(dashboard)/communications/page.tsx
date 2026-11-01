'use client';

import Link from 'next/link';
import { Mail, MessageSquare, Webhook, FileText } from 'lucide-react';

const CARDS = [
  {
    title: 'Email Campaigns',
    description: 'Create and send bulk email campaigns to your customers.',
    href: '/communications/campaigns',
    icon: Mail,
    color: 'bg-blue-500',
  },
  {
    title: 'Templates',
    description: 'Manage reusable message templates for email, SMS and more.',
    href: '/communications/templates',
    icon: FileText,
    color: 'bg-purple-500',
  },
  {
    title: 'Telegram',
    description: 'Configure Telegram bot notifications for business events.',
    href: '/communications/telegram',
    icon: MessageSquare,
    color: 'bg-sky-500',
  },
  {
    title: 'Webhooks',
    description: 'Connect external services via webhook endpoints.',
    href: '/communications/webhooks',
    icon: Webhook,
    color: 'bg-amber-500',
  },
];

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage email, notifications, Telegram and webhook integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow group"
          >
            <div className={`${card.color} w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
              <card.icon className="text-white" size={24} />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">{card.title}</h2>
            <p className="text-sm text-gray-500">{card.description}</p>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Email Providers</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure SMTP, SendGrid or Mailgun to send emails from your campaigns.
        </p>
        <Link
          href="/communications/email-providers"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Mail size={16} />
          Manage Email Providers
        </Link>
      </div>
    </div>
  );
}
