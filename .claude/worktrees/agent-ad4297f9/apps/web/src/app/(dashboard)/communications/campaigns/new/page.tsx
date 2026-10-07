'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';

type Step = 1 | 2 | 3 | 4;

interface CampaignForm {
  name: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  htmlContent: string;
  textContent: string;
  emails: string;
  scheduledAt: string;
}

const STEPS = ['Details', 'Content', 'Recipients', 'Send'];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<CampaignForm>({
    name: '',
    subject: '',
    fromEmail: '',
    fromName: '',
    htmlContent: '',
    textContent: '',
    emails: '',
    scheduledAt: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create campaign
      const res = await api().post<{ data: { id: string } }>('/email-campaigns', {
        name: form.name,
        subject: form.subject,
        fromEmail: form.fromEmail || undefined,
        fromName: form.fromName || undefined,
        htmlContent: form.htmlContent || undefined,
        textContent: form.textContent || undefined,
      });
      const campaign = res.data.data ?? (res.data as unknown as { id: string });

      // Step 2: Add recipients if emails provided
      const emails = form.emails
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'));

      if (emails.length > 0) {
        await api().post(`/email-campaigns/${campaign.id}/recipients`, { emails });
      }

      return campaign;
    },
    onSuccess: (campaign) => {
      router.push(`/communications/campaigns/${campaign.id}`);
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ data: { id: string } }>('/email-campaigns', {
        name: form.name,
        subject: form.subject,
        fromEmail: form.fromEmail || undefined,
        fromName: form.fromName || undefined,
        htmlContent: form.htmlContent || undefined,
        textContent: form.textContent || undefined,
      });
      const campaign = res.data.data ?? (res.data as unknown as { id: string });

      const emails = form.emails
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'));

      if (emails.length > 0) {
        await api().post(`/email-campaigns/${campaign.id}/recipients`, { emails });
      }

      if (form.scheduledAt) {
        await api().post(`/email-campaigns/${campaign.id}/schedule`, {
          scheduledAt: form.scheduledAt,
        });
      } else {
        await api().post(`/email-campaigns/${campaign.id}/send`);
      }

      return campaign;
    },
    onSuccess: () => {
      router.push('/communications/campaigns');
    },
  });

  const setField = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const num = (i + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === num
                    ? 'bg-blue-600 text-white'
                    : step > num
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {num}
              </div>
              <span className={`text-sm ${step === num ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-300" />}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        {step === 1 && (
          <>
            <h2 className="font-semibold text-gray-900">Campaign Details</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. December Newsletter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.subject}
                onChange={(e) => setField('subject', e.target.value)}
                placeholder="e.g. Your exclusive offer inside"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.fromName}
                  onChange={(e) => setField('fromName', e.target.value)}
                  placeholder="KNEF Gadgets"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                <input
                  type="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.fromEmail}
                  onChange={(e) => setField('fromEmail', e.target.value)}
                  placeholder="noreply@knef.com"
                />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-semibold text-gray-900">Email Content</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HTML Content</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono h-48 resize-none"
                value={form.htmlContent}
                onChange={(e) => setField('htmlContent', e.target.value)}
                placeholder="<h1>Hello {{name}}</h1><p>Your email content here...</p>"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plain Text (optional)</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-24 resize-none"
                value={form.textContent}
                onChange={(e) => setField('textContent', e.target.value)}
                placeholder="Plain text version of your email..."
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-semibold text-gray-900">Recipients</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email addresses (one per line, or comma separated)
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono h-48 resize-none"
                value={form.emails}
                onChange={(e) => setField('emails', e.target.value)}
                placeholder="customer@example.com&#10;another@example.com"
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.emails.split(/[\n,;]+/).filter((e) => e.trim().includes('@')).length} valid emails detected
              </p>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-semibold text-gray-900">Schedule or Send</h2>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Campaign:</span>
                <span className="font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subject:</span>
                <span className="font-medium truncate max-w-xs">{form.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recipients:</span>
                <span className="font-medium">
                  {form.emails.split(/[\n,;]+/).filter((e) => e.trim().includes('@')).length} emails
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Schedule for later (optional)
              </label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.scheduledAt}
                onChange={(e) => setField('scheduledAt', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty to send immediately.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || sendNowMutation.isPending}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                onClick={() => sendNowMutation.mutate()}
                disabled={createMutation.isPending || sendNowMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sendNowMutation.isPending
                  ? 'Sending...'
                  : form.scheduledAt
                  ? 'Schedule Campaign'
                  : 'Send Now'}
              </button>
            </div>
          </>
        )}
      </div>

      {step < 4 && (
        <div className="flex justify-between">
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={step === 1 && (!form.name || !form.subject)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
