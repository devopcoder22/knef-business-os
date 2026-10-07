'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, BookOpen, Loader2, Search, FileText, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AIDocument {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  chunkCount: number;
  mimeType: string;
  createdAt: string;
  _count?: { chunks: number };
}

interface SearchResult {
  chunk: { id: string; content: string; documentId: string };
  document: { id: string; title: string };
  score: number;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', icon: Clock, cls: 'bg-gray-100 text-gray-600' },
  PROCESSING: { label: 'Processing', icon: Loader2, cls: 'bg-blue-100 text-blue-600' },
  READY: { label: 'Ready', icon: CheckCircle, cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Failed', icon: XCircle, cls: 'bg-red-100 text-red-600' },
};

interface UploadForm {
  title: string;
  description: string;
  content: string;
  mimeType: string;
}

const defaultForm: UploadForm = {
  title: '',
  description: '',
  content: '',
  mimeType: 'text/plain',
};

function KnowledgeContent() {
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>(defaultForm);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data, isLoading } = useQuery<{ data: AIDocument[]; meta: { total: number } }>({
    queryKey: ['ai-documents'],
    queryFn: () => api().get('/ai/knowledge/documents').then((r) => r.data),
  });

  const uploadDoc = useMutation({
    mutationFn: (d: UploadForm) => api().post('/ai/knowledge/documents', d).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-documents'] });
      setShowUpload(false);
      setForm(defaultForm);
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api().delete(`/ai/knowledge/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-documents'] }),
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await api().post('/ai/knowledge/search', { query: searchQuery, topK: 8 });
      setSearchResults(res.data);
    } finally {
      setSearching(false);
    }
  };

  const documents = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload documents to build a searchable knowledge base with RAG.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Upload Document
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search knowledge base…"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
          {searchResults !== null && (
            <button
              onClick={() => { setSearchResults(null); setSearchQuery(''); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>

        {searchResults !== null && (
          <div className="mt-4 space-y-3">
            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No results found.</p>
            ) : (
              searchResults.map((r) => (
                <div key={r.chunk.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-600">{r.document.title}</span>
                    <span className="ml-auto text-xs text-gray-400">Score: {(r.score * 100).toFixed(1)}%</span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-3">{r.chunk.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">No documents uploaded yet.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload First Document
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Chunks</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => {
                const s = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.PENDING;
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                          {doc.description && (
                            <p className="text-xs text-gray-500 truncate max-w-xs">{doc.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', s.cls)}>
                        <s.icon size={11} className={doc.status === 'PROCESSING' ? 'animate-spin' : ''} />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{doc.chunkCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm('Delete this document?')) deleteDoc.mutate(doc.id); }}
                        className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Upload Document</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Document title"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={10}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
                  placeholder="Paste document content here…"
                />
              </div>
              {uploadDoc.isError && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle size={14} />
                  {(uploadDoc.error as Error)?.message ?? 'Upload failed'}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowUpload(false); setForm(defaultForm); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => uploadDoc.mutate(form)}
                disabled={!form.title || !form.content || uploadDoc.isPending}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {uploadDoc.isPending ? 'Uploading…' : 'Upload & Process'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIKnowledgePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}>
      <KnowledgeContent />
    </Suspense>
  );
}
