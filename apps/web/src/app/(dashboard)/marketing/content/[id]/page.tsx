'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Sparkles, ChevronDown, RotateCcw, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── AI action types ──────────────────────────────────────────────────────────
type AIAction = 'generate' | 'rewrite' | 'shorten' | 'expand' | 'tone' | 'cta' | 'hashtags' | 'variant';

interface AIResult {
  body?: string | null;
  callToAction?: string | null;
  suggestedBody?: string | null;
  suggestedCallToAction?: string | null;
  originalBody?: string | null;
  options?: string[];
  hashtags?: string[];
  platform?: string;
  model?: string;
}

const TONES = ['professional', 'casual', 'friendly', 'urgent', 'playful', 'formal', 'empathetic'];
const AI_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SNAPCHAT', 'WHATSAPP', 'SMS', 'EMAIL', 'WEB_PUSH', 'STOREFRONT', 'TELEGRAM'];

interface Draft {
  id: string;
  title: string;
  body: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  targetChannel: string;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  campaign: { id: string; name: string } | null;
  variants: Array<{
    id: string;
    platform: string;
    body: string | null;
    callToAction: string | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-50 text-gray-400',
};

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SNAPCHAT', 'WHATSAPP', 'SMS', 'EMAIL', 'WEB_PUSH', 'STOREFRONT', 'TELEGRAM'];

export default function ContentDraftDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showVariantForm, setShowVariantForm] = useState(false);
  const [variantPlatform, setVariantPlatform] = useState('INSTAGRAM');
  const [variantBody, setVariantBody] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // AI state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiAction, setAiAction] = useState<AIAction>('generate');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiPlatform, setAiPlatform] = useState('INSTAGRAM');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiSaving, setAiSaving] = useState(false);

  const { data: draft, isLoading } = useQuery<Draft>({
    queryKey: ['marketing-draft', id],
    queryFn: async () => {
      const res = await api().get<Draft>(`/marketing/content/${id}`);
      return res.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketing-draft', id] });

  const submitMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/submit-review`),
    onSuccess: invalidate,
  });

  const approveMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/approve`),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/reject`),
    onSuccess: invalidate,
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      api().post(`/marketing/content/${id}/schedule`, { scheduledAt, timezone: 'UTC' }),
    onSuccess: () => { invalidate(); setShowScheduleForm(false); },
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/cancel-schedule`),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/archive`),
    onSuccess: () => router.push('/marketing/content'),
  });

  const addVariantMutation = useMutation({
    mutationFn: () =>
      api().post(`/marketing/content/${id}/variants`, { platform: variantPlatform, body: variantBody }),
    onSuccess: () => { invalidate(); setShowVariantForm(false); setVariantBody(''); },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (variantId: string) =>
      api().delete(`/marketing/content/${id}/variants/${variantId}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="text-gray-400 text-sm">Loading...</div>;
  if (!draft) return <div className="text-gray-400 text-sm">Draft not found</div>;

  const existingPlatforms = new Set(draft.variants.map((v) => v.platform));
  const availablePlatforms = PLATFORMS.filter((p) => !existingPlatforms.has(p));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{draft.title}</h1>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[draft.status])}>
                {draft.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm">
              {draft.targetChannel}
              {draft.campaign && ` · ${draft.campaign.name}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end shrink-0">
          <button
            onClick={() => { setShowAiPanel((v) => !v); setAiResult(null); setAiError(''); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors',
              showAiPanel
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50',
            )}
          >
            <Sparkles size={13} />
            AI Assist
          </button>
          {draft.status === 'DRAFT' && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
              Submit for Review
            </button>
          )}
          {draft.status === 'REVIEW' && (<>
            <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50">
              Reject
            </button>
          </>)}
          {draft.status === 'APPROVED' && (
            <button onClick={() => setShowScheduleForm(true)}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700">
              Schedule
            </button>
          )}
          {draft.status === 'SCHEDULED' && (
            <button onClick={() => cancelScheduleMutation.mutate()} disabled={cancelScheduleMutation.isPending}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50">
              Cancel Schedule
            </button>
          )}
          {!['PUBLISHED', 'ARCHIVED'].includes(draft.status) && (
            <button onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 font-medium">
              Archive
            </button>
          )}
        </div>
      </div>

      {showScheduleForm && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-purple-800">Schedule Publication</p>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <div className="flex gap-2">
            <button onClick={() => scheduledAt && scheduleMutation.mutate()} disabled={!scheduledAt || scheduleMutation.isPending}
              className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              Confirm
            </button>
            <button onClick={() => setShowScheduleForm(false)} className="px-3 py-1.5 text-xs text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── AI Assistant Panel ── */}
      {showAiPanel && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-600" />
            <p className="text-sm font-semibold text-violet-800">AI Content Assistant</p>
            <span className="text-xs text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded">DRAFT only — review before applying</span>
          </div>

          {/* Action selector */}
          <div className="flex flex-wrap gap-2">
            {([ ['generate','Generate'], ['rewrite','Rewrite'], ['shorten','Shorten'], ['expand','Expand'],
               ['tone','Change Tone'], ['cta','CTA Ideas'], ['hashtags','Hashtags'], ['variant','Platform Variant'],
             ] as [AIAction, string][]).map(([action, label]) => (
              <button key={action} onClick={() => { setAiAction(action); setAiResult(null); setAiError(''); }}
                className={cn('px-3 py-1 text-xs rounded-full font-medium border transition-colors',
                  aiAction === action ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50',
                )}>
                {label}
              </button>
            ))}
          </div>

          {/* Action-specific options */}
          <div className="space-y-2">
            {aiAction === 'tone' && (
              <div>
                <label className="block text-xs font-medium text-violet-700 mb-1">Tone</label>
                <select value={aiTone} onChange={(e) => setAiTone(e.target.value)}
                  className="w-48 px-2 py-1.5 text-xs border border-violet-200 rounded-lg focus:outline-none bg-white">
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {aiAction === 'variant' && (
              <div>
                <label className="block text-xs font-medium text-violet-700 mb-1">Platform</label>
                <select value={aiPlatform} onChange={(e) => setAiPlatform(e.target.value)}
                  className="w-48 px-2 py-1.5 text-xs border border-violet-200 rounded-lg focus:outline-none bg-white">
                  {AI_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {['generate', 'rewrite', 'expand'].includes(aiAction) && (
              <div>
                <label className="block text-xs font-medium text-violet-700 mb-1">Additional instruction (optional)</label>
                <input value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder="e.g. emphasize limited availability, use a conversational tone..."
                  className="w-full px-3 py-2 text-xs border border-violet-200 rounded-lg focus:outline-none bg-white" />
              </div>
            )}
          </div>

          {/* Run button */}
          <button
            disabled={aiSaving}
            onClick={async () => {
              setAiResult(null);
              setAiError('');
              setAiSaving(true);
              try {
                let res: AIResult;
                const base = `/marketing/ai/content/${id}`;
                if (aiAction === 'generate') {
                  res = await api().post<AIResult>(`${base}/generate`, { instruction: aiInstruction || undefined }).then(r => r.data);
                } else if (aiAction === 'rewrite') {
                  res = await api().post<AIResult>(`${base}/rewrite`, { instruction: aiInstruction || undefined }).then(r => r.data);
                } else if (aiAction === 'shorten') {
                  res = await api().post<AIResult>(`${base}/shorten`).then(r => r.data);
                } else if (aiAction === 'expand') {
                  res = await api().post<AIResult>(`${base}/expand`, { instruction: aiInstruction || undefined }).then(r => r.data);
                } else if (aiAction === 'tone') {
                  res = await api().post<AIResult>(`${base}/tone`, { tone: aiTone }).then(r => r.data);
                } else if (aiAction === 'cta') {
                  res = await api().post<AIResult>(`${base}/cta`).then(r => r.data);
                } else if (aiAction === 'hashtags') {
                  res = await api().post<AIResult>(`${base}/hashtags`).then(r => r.data);
                } else {
                  res = await api().post<AIResult>(`${base}/variants`, { platform: aiPlatform, saveToDraft: false }).then(r => r.data);
                }
                setAiResult(res);
              } catch (e: unknown) {
                const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                setAiError(typeof msg === 'string' ? msg : 'AI generation failed. Check provider configuration.');
              } finally {
                setAiSaving(false);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-xs rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {aiSaving ? <><RotateCcw size={13} className="animate-spin" /> Generating...</> : <><Sparkles size={13} /> Generate</>}
          </button>

          {/* Error */}
          {aiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{aiError}</div>
          )}

          {/* Result preview */}
          {aiResult && (
            <div className="bg-white border border-violet-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                  <Sparkles size={12} /> AI Suggestion
                  {aiResult.model && <span className="text-violet-400 font-normal">· {aiResult.model}</span>}
                </p>
                <button onClick={() => setAiResult(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>

              {/* Text suggestions */}
              {(aiResult.suggestedBody ?? aiResult.body) && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Suggested body:</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded p-2">
                    {aiResult.suggestedBody ?? aiResult.body}
                  </p>
                </div>
              )}
              {(aiResult.suggestedCallToAction ?? aiResult.callToAction) && (
                <p className="text-xs text-blue-600 font-medium">
                  CTA: {aiResult.suggestedCallToAction ?? aiResult.callToAction}
                </p>
              )}

              {/* CTA options */}
              {aiResult.options && aiResult.options.length > 0 && (
                <div className="space-y-1">
                  {aiResult.options.map((opt, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded text-sm">
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {aiResult.hashtags && aiResult.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aiResult.hashtags.map((h) => (
                    <span key={h} className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">#{h}</span>
                  ))}
                </div>
              )}

              {/* Apply button — only for body suggestions */}
              {(aiResult.suggestedBody ?? aiResult.body) && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={async () => {
                      const body = aiResult.suggestedBody ?? aiResult.body;
                      const cta = aiResult.suggestedCallToAction ?? aiResult.callToAction ?? undefined;
                      if (!body) return;
                      try {
                        await api().post(`/marketing/ai/content/${id}/generate`, {
                          applyToDraft: true,
                          instruction: `Apply this exact text: ${body}`,
                        });
                        queryClient.invalidateQueries({ queryKey: ['marketing-draft', id] });
                        setAiResult(null);
                        setShowAiPanel(false);
                      } catch {
                        // If apply fails, user can manually copy — preserve original
                      }
                      void cta;
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Check size={12} /> Apply to Draft
                  </button>
                  <button onClick={() => setAiResult(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                    Discard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {draft.scheduledAt && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-800">
          Scheduled: {new Date(draft.scheduledAt).toLocaleString()} ({draft.timezone})
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">Content</h2>
        {draft.body ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{draft.body}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No body written yet</p>
        )}
        {draft.callToAction && (
          <p className="text-xs text-blue-600 font-medium">CTA: {draft.callToAction}</p>
        )}
        {draft.destinationUrl && (
          <p className="text-xs text-gray-400 truncate">URL: {draft.destinationUrl}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Platform Variants</h2>
          {availablePlatforms.length > 0 && (
            <button onClick={() => { setVariantPlatform(availablePlatforms[0]!); setShowVariantForm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              <Plus size={13} />
              Add Variant
            </button>
          )}
        </div>

        {showVariantForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
            <select value={variantPlatform} onChange={(e) => setVariantPlatform(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              {availablePlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <textarea value={variantBody} onChange={(e) => setVariantBody(e.target.value)}
              rows={3} placeholder={`Write ${variantPlatform} specific copy...`}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={() => addVariantMutation.mutate()} disabled={addVariantMutation.isPending}
                className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Add
              </button>
              <button onClick={() => setShowVariantForm(false)} className="px-3 py-1.5 text-xs text-gray-500">
                Cancel
              </button>
            </div>
          </div>
        )}

        {draft.variants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No platform variants yet</p>
        ) : (
          <div className="space-y-3">
            {draft.variants.map((variant) => (
              <div key={variant.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-600 mb-1">{variant.platform}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{variant.body ?? '—'}</p>
                  {variant.callToAction && (
                    <p className="text-xs text-blue-600 mt-1">{variant.callToAction}</p>
                  )}
                </div>
                <button onClick={() => deleteVariantMutation.mutate(variant.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
