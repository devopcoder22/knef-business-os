'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Sparkles, ChevronDown, RotateCcw, Check, X, Send, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
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

interface SocialAccount {
  id: string;
  provider: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  approvalStatus: string;
  capabilities: string[];
}

interface PublicationAttempt {
  id: string;
  provider: string;
  status: string;
  externalPostId: string | null;
  errorMessage: string | null;
  isRetryable: boolean;
  publishedAt: string | null;
  attemptedAt: string | null;
  socialAccount: { provider: string; displayName: string; avatarUrl: string | null };
}

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  READY: 'text-green-600 bg-green-50',
  CONNECTED: 'text-blue-600 bg-blue-50',
  APP_REVIEW_PENDING: 'text-amber-600 bg-amber-50',
  AUDIT_PENDING: 'text-amber-600 bg-amber-50',
  SCOPES_INCOMPLETE: 'text-red-600 bg-red-50',
  TOKEN_EXPIRED: 'text-red-600 bg-red-50',
  DISCONNECTED: 'text-gray-500 bg-gray-100',
};

const ATTEMPT_STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'text-green-600 bg-green-50',
  PROCESSING: 'text-blue-600 bg-blue-50',
  QUEUED: 'text-blue-600 bg-blue-50',
  UPLOADING: 'text-blue-600 bg-blue-50',
  FAILED: 'text-red-600 bg-red-50',
  REQUIRES_USER_ACTION: 'text-amber-600 bg-amber-50',
  PENDING: 'text-gray-500 bg-gray-100',
  CANCELLED: 'text-gray-500 bg-gray-100',
};

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
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  // AI state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiAction, setAiAction] = useState<AIAction>('generate');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiPlatform, setAiPlatform] = useState('INSTAGRAM');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiSaving, setAiSaving] = useState(false);   // generating
  const [aiApplying, setAiApplying] = useState(false); // persisting exact preview

  // Publish panel state
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [publishError, setPublishError] = useState<Record<string, string>>({});

  const { data: draft, isLoading } = useQuery<Draft>({
    queryKey: ['marketing-draft', id],
    queryFn: async () => {
      const res = await api().get<Draft>(`/marketing/content/${id}`);
      return res.data;
    },
  });

  const { data: socialAccounts = [] } = useQuery<SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await api().get<SocialAccount[]>('/social/accounts');
      return res.data;
    },
    enabled: showPublishPanel || showScheduleForm,
  });

  const { data: attempts = [], refetch: refetchAttempts } = useQuery<PublicationAttempt[]>({
    queryKey: ['publication-attempts', id],
    queryFn: async () => {
      const res = await api().get<PublicationAttempt[]>(`/social/drafts/${id}/attempts`);
      return res.data;
    },
    enabled: showPublishPanel,
    refetchInterval: showPublishPanel ? 10_000 : false,
  });

  const { data: publicationTargets = [] } = useQuery<Array<{
    id: string;
    provider: string;
    isCancelled: boolean;
    socialAccount: {
      id: string;
      provider: string;
      displayName: string;
      username: string | null;
      avatarUrl: string | null;
      approvalStatus: string;
    };
  }>>({
    queryKey: ['publication-targets', id],
    queryFn: async () => {
      const res = await api().get(`/marketing/content/${id}/targets`);
      return res.data;
    },
    enabled: draft?.status === 'SCHEDULED',
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
      api().post(`/marketing/content/${id}/schedule`, {
        scheduledAt,
        timezone: 'UTC',
        targetAccountIds: selectedTargetIds,
      }),
    onSuccess: () => {
      invalidate();
      setShowScheduleForm(false);
      setSelectedTargetIds([]);
    },
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

  const publishMutation = useMutation({
    mutationFn: (socialAccountId: string) =>
      api().post('/social/publish', { draftId: id, socialAccountId }),
    onSuccess: () => {
      refetchAttempts();
      invalidate();
      setPublishError({});
    },
    onError: (err: { response?: { data?: { message?: string } } }, socialAccountId: string) => {
      setPublishError((prev) => ({
        ...prev,
        [socialAccountId]: err?.response?.data?.message ?? 'Publish failed',
      }));
    },
  });

  const retryMutation = useMutation({
    mutationFn: (attemptId: string) =>
      api().post(`/social/attempts/${attemptId}/retry`),
    onSuccess: () => refetchAttempts(),
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

          {/* Target account selection */}
          {socialAccounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-purple-700">Publish to (select at least one):</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {socialAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTargetIds.includes(account.id)}
                      onChange={(e) => {
                        setSelectedTargetIds((prev) =>
                          e.target.checked
                            ? [...prev, account.id]
                            : prev.filter((aid) => aid !== account.id),
                        );
                      }}
                      className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-xs text-gray-700 group-hover:text-gray-900">
                      <span className="font-medium">{account.displayName}</span>
                      {account.username && <span className="text-gray-400 ml-1">@{account.username}</span>}
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                        {account.provider}
                      </span>
                      {account.approvalStatus !== 'READY' && account.approvalStatus !== 'CONNECTED' && (
                        <span className="ml-1 text-amber-600 text-xs">({account.approvalStatus})</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {selectedTargetIds.length === 0 && (
                <p className="text-xs text-red-500">Please select at least one account</p>
              )}
            </div>
          )}
          {socialAccounts.length === 0 && (
            <p className="text-xs text-amber-600">
              No connected social accounts found. Connect accounts in{' '}
              <a href="/social/accounts" className="underline">Social Accounts</a> first.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => scheduledAt && selectedTargetIds.length > 0 && scheduleMutation.mutate()}
              disabled={!scheduledAt || selectedTargetIds.length === 0 || scheduleMutation.isPending}
              className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => { setShowScheduleForm(false); setSelectedTargetIds([]); }}
              className="px-3 py-1.5 text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {draft.status === 'SCHEDULED' && publicationTargets.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-sm font-medium text-purple-800 mb-2">
            Scheduled targets ({publicationTargets.length})
          </p>
          <div className="space-y-1.5">
            {publicationTargets.map((target) => (
              <div key={target.id} className="flex items-center gap-2 text-xs text-gray-700">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="font-medium">{target.socialAccount.displayName}</span>
                {target.socialAccount.username && (
                  <span className="text-gray-400">@{target.socialAccount.username}</span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                  {target.provider}
                </span>
              </div>
            ))}
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

              {/* Apply button — persists exact preview via PATCH (no second AI call) */}
              {(aiResult.suggestedBody ?? aiResult.body) && (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={aiApplying}
                    onClick={async () => {
                      const exactBody = aiResult.suggestedBody ?? aiResult.body;
                      const exactCta = aiResult.suggestedCallToAction ?? aiResult.callToAction ?? undefined;
                      if (!exactBody) return;
                      setAiApplying(true);
                      try {
                        // PATCH /marketing/content/:id — existing endpoint, no AI involved
                        await api().patch(`/marketing/content/${id}`, {
                          body: exactBody,
                          ...(exactCta !== undefined && { callToAction: exactCta }),
                        });
                        queryClient.invalidateQueries({ queryKey: ['marketing-draft', id] });
                        setAiResult(null);
                        setShowAiPanel(false);
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiError(typeof msg === 'string' ? msg : 'Failed to save — original is unchanged.');
                      } finally {
                        setAiApplying(false);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {aiApplying ? <><RotateCcw size={12} className="animate-spin" /> Saving...</> : <><Check size={12} /> Apply to Draft</>}
                  </button>
                  <button
                    disabled={aiApplying}
                    onClick={() => setAiResult(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Discard
                  </button>
                </div>
              )}

              {/* Apply Variant button — creates/updates exact variant via POST/PATCH (no second AI call) */}
              {aiResult.platform && aiResult.body && !aiResult.suggestedBody && (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={aiApplying}
                    onClick={async () => {
                      if (!draft || !aiResult.platform || !aiResult.body) return;
                      setAiApplying(true);
                      try {
                        const existing = draft.variants.find((v) => v.platform === aiResult.platform);
                        if (existing) {
                          await api().patch(`/marketing/content/${id}/variants/${existing.id}`, {
                            body: aiResult.body,
                            callToAction: aiResult.callToAction ?? null,
                          });
                        } else {
                          await api().post(`/marketing/content/${id}/variants`, {
                            platform: aiResult.platform,
                            body: aiResult.body,
                            callToAction: aiResult.callToAction ?? null,
                          });
                        }
                        queryClient.invalidateQueries({ queryKey: ['marketing-draft', id] });
                        setAiResult(null);
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiError(typeof msg === 'string' ? msg : 'Failed to save variant.');
                      } finally {
                        setAiApplying(false);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {aiApplying ? <><RotateCcw size={12} className="animate-spin" /> Saving...</> : <><Check size={12} /> Save {aiResult.platform} Variant</>}
                  </button>
                  <button disabled={aiApplying} onClick={() => setAiResult(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
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

      {/* ── Publish to Social ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Send size={14} className="text-blue-500" />
            Publish to Social
          </h2>
          <button
            onClick={() => setShowPublishPanel((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showPublishPanel ? 'Hide' : 'Show'}
          </button>
        </div>

        {!['APPROVED', 'SCHEDULED'].includes(draft.status) && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle size={12} />
            Draft must be APPROVED or SCHEDULED before publishing.
          </div>
        )}

        {showPublishPanel && ['APPROVED', 'SCHEDULED'].includes(draft.status) && (
          <>
            {/* Available social accounts */}
            {socialAccounts.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">
                No social accounts connected.{' '}
                <a href="/social/accounts" className="text-blue-600 underline">Set up accounts</a>
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                <p className="text-xs text-gray-500 font-medium">Select account to publish:</p>
                {socialAccounts.map((acct) => (
                  <div key={acct.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 min-w-0">
                      {acct.avatarUrl && (
                        <img src={acct.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{acct.displayName}</p>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full font-medium',
                          APPROVAL_STATUS_COLORS[acct.approvalStatus] ?? 'text-gray-500 bg-gray-100',
                        )}>
                          {acct.approvalStatus.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {publishError[acct.id] && (
                        <span className="text-xs text-red-600">{publishError[acct.id]}</span>
                      )}
                      <button
                        onClick={() => publishMutation.mutate(acct.id)}
                        disabled={publishMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <Send size={12} />
                        Publish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Publication history */}
            {attempts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 font-medium">Publication history:</p>
                  <button onClick={() => refetchAttempts()} className="text-xs text-gray-400 hover:text-gray-600">
                    <RefreshCw size={11} />
                  </button>
                </div>
                <div className="space-y-2">
                  {attempts.map((attempt) => (
                    <div key={attempt.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {attempt.socialAccount.displayName}
                          </span>
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full font-medium',
                            ATTEMPT_STATUS_COLORS[attempt.status] ?? 'text-gray-500 bg-gray-100',
                          )}>
                            {attempt.status}
                          </span>
                        </div>
                        {attempt.externalPostId && (
                          <a
                            href={`https://www.facebook.com/${attempt.externalPostId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            View post <ExternalLink size={10} />
                          </a>
                        )}
                        {attempt.errorMessage && (
                          <p className="text-xs text-red-600 mt-0.5 truncate">{attempt.errorMessage}</p>
                        )}
                      </div>
                      {attempt.isRetryable && attempt.status === 'FAILED' && (
                        <button
                          onClick={() => retryMutation.mutate(attempt.id)}
                          disabled={retryMutation.isPending}
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                        >
                          <RotateCcw size={11} />
                          Retry
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
