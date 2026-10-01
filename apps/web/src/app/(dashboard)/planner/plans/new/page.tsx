'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Map,
  Sparkles,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckSquare,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type PlanType = 'PERSONAL' | 'BUSINESS' | 'PROJECT' | 'CAMPAIGN' | 'OPERATIONAL' | 'STRATEGIC';

const PLAN_TYPES: PlanType[] = ['PERSONAL', 'BUSINESS', 'PROJECT', 'CAMPAIGN', 'OPERATIONAL', 'STRATEGIC'];

const TYPE_DESCRIPTIONS: Record<PlanType, string> = {
  PERSONAL: 'Individual goals, daily/weekly priorities',
  BUSINESS: 'Company-wide initiatives and strategy',
  PROJECT: 'Time-boxed deliverable with tasks',
  CAMPAIGN: 'Marketing or sales campaign',
  OPERATIONAL: 'Ongoing operational process',
  STRATEGIC: 'Long-term strategic objective',
};

interface CreatedPlan {
  id: string;
  title: string;
  status: string;
}

interface GeneratedPreview {
  title: string;
  objective: string;
  steps: Array<{ title: string; tasks: Array<{ title: string; priority: string }> }>;
  kpis: Array<{ name: string; target: string; unit: string }>;
  risks: string[];
  warnings: string[];
}

type Step = 'details' | 'generate' | 'review';

export default function NewPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultType = (searchParams.get('type') as PlanType) ?? 'BUSINESS';

  const [step, setStep] = useState<Step>('details');
  const [planId, setPlanId] = useState('');
  const [type, setType] = useState<PlanType>(defaultType);
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<CreatedPlan>('/plans', {
        type,
        title: `New ${type.charAt(0) + type.slice(1).toLowerCase()} Plan`,
        description: description || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPlanId(data.id);
      setStep('generate');
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ plan: unknown; preview: GeneratedPreview }>(`/plans/${planId}/generate`, {
        instruction,
        targetDate: targetDate || undefined,
        includeBusinessContext: includeContext,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setStep('review');
    },
  });

  const handleCreate = () => {
    if (!description.trim() && !instruction.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/planner/plans" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Plan</h1>
          <p className="text-gray-500 text-sm">AI-powered planning in 3 steps</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {(['details', 'generate', 'review'] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = { details: '1. Details', generate: '2. Instruct AI', review: '3. Review' };
          const done = step === 'generate' ? i === 0 : step === 'review' ? i <= 1 : false;
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium',
                active ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400',
              )}>
                {labels[s]}
              </div>
              {i < 2 && <ChevronRight size={12} className="text-gray-300" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Details */}
      {step === 'details' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Plan Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Plan Type</label>
            <div className="grid grid-cols-2 gap-2">
              {PLAN_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    'text-left px-4 py-3 rounded-xl border transition-colors',
                    type === t ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <p className={cn('text-sm font-semibold', type === t ? 'text-blue-700' : 'text-gray-800')}>{t}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{TYPE_DESCRIPTIONS[t]}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Brief Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this plan about?"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Target Date <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ctx"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="ctx" className="text-sm text-gray-700">Include business context (goals, tasks, KPIs)</label>
          </div>

          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            Continue
          </button>

          {createMutation.isError && (
            <p className="text-sm text-red-600">{(createMutation.error as Error)?.message ?? 'Failed to create plan.'}</p>
          )}
        </div>
      )}

      {/* Step 2: Generate */}
      {step === 'generate' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            <h2 className="font-semibold text-gray-900">Instruct the AI Planner</h2>
          </div>
          <p className="text-sm text-gray-500">
            Describe what you want to achieve. The AI will generate a structured plan with steps, tasks, KPIs and timelines.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Instruction <span className="text-red-500">*</span></label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={`e.g. "Create a Q4 sales campaign plan to increase gadget sales by 30% in Lagos and Abuja, focusing on high-margin products like iPhones and Samsung Galaxy."`}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              rows={5}
            />
          </div>

          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !instruction.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating plan…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate Plan
              </>
            )}
          </button>

          {generateMutation.isError && (
            <p className="text-sm text-red-600">{(generateMutation.error as Error)?.message ?? 'Generation failed. Please try again.'}</p>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && preview && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CheckSquare size={18} className="text-green-600" />
              <h2 className="font-semibold text-gray-900">AI Plan Generated</h2>
            </div>

            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
              <h3 className="font-bold text-gray-900">{preview.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{preview.objective}</p>
            </div>

            {/* Steps summary */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps ({preview.steps.length})</h4>
              <div className="space-y-2">
                {preview.steps.map((step, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{step.title}</p>
                    {step.tasks.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{step.tasks.length} tasks: {step.tasks.slice(0, 3).map(t => t.title).join(', ')}{step.tasks.length > 3 ? '…' : ''}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* KPIs */}
            {preview.kpis.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">KPIs ({preview.kpis.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.kpis.map((kpi, i) => (
                    <div key={i} className="px-3 py-1.5 bg-purple-50 border border-purple-100 rounded-lg text-xs">
                      <span className="font-medium text-purple-800">{kpi.name}</span>
                      <span className="text-purple-500 ml-1">→ {kpi.target} {kpi.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-yellow-800 flex items-center gap-1"><AlertTriangle size={11} /> Warnings</p>
                {preview.warnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">{w}</p>)}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('generate')}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Regenerate
            </button>
            <button
              onClick={() => router.push(`/planner/plans/${planId}`)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              View Plan →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
