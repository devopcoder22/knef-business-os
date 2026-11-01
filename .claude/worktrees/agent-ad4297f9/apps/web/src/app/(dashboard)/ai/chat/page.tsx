'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Archive, Bot, User, Loader2, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AIConversation {
  id: string;
  title: string;
  isArchived: boolean;
  updatedAt: string;
  _count?: { messages: number };
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  totalTokens: number | null;
  createdAt: string;
}

interface ConversationDetail extends AIConversation {
  messages: AIMessage[];
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm font-mono">$1</code>')
    .replace(/\n/g, '<br />');
}

export default function AIChatPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery<AIConversation[]>({
    queryKey: ['ai-conversations'],
    queryFn: () => api().get('/ai/conversations').then((r) => r.data.data),
  });

  const { data: active, isFetching: loadingActive } = useQuery<ConversationDetail>({
    queryKey: ['ai-conversation', activeId],
    queryFn: () => api().get(`/ai/conversations/${activeId}`).then((r) => r.data),
    enabled: !!activeId,
  });

  const createConv = useMutation({
    mutationFn: () => api().post('/ai/conversations', { title: 'New Conversation' }).then((r) => r.data),
    onSuccess: (data: AIConversation) => {
      qc.invalidateQueries({ queryKey: ['ai-conversations'] });
      setActiveId(data.id);
    },
  });

  const sendMsg = useMutation({
    mutationFn: (content: string) =>
      api().post(`/ai/conversations/${activeId}/messages`, { content }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversation', activeId] });
      qc.invalidateQueries({ queryKey: ['ai-conversations'] });
      setInput('');
    },
  });

  const archiveConv = useMutation({
    mutationFn: (id: string) => api().patch(`/ai/conversations/${id}/archive`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations'] });
      if (activeId) setActiveId(null);
    },
  });

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [active?.messages]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || !activeId || sendMsg.isPending) return;
    sendMsg.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeConvs = conversations.filter((c) => !c.isArchived);

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 overflow-hidden rounded-none">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={() => createConv.mutate()}
            disabled={createConv.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            New Conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {activeConvs.length === 0 ? (
            <p className="p-4 text-xs text-gray-400 text-center">No conversations yet</p>
          ) : (
            activeConvs.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 hover:bg-gray-100 transition-colors group flex items-start gap-2',
                  activeId === c.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700',
                )}
              >
                <MessageSquare size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-xs">{c.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); archiveConv.mutate(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
                  title="Archive"
                >
                  <Archive size={12} />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-white">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <Bot size={48} className="mx-auto text-gray-300 mb-4" />
              <h2 className="text-lg font-semibold text-gray-700 mb-2">AI Chat</h2>
              <p className="text-sm text-gray-500 mb-4">Select a conversation or create a new one to start.</p>
              <button
                onClick={() => createConv.mutate()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingActive ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : (active?.messages ?? []).length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  Send a message to start the conversation.
                </div>
              ) : (
                (active?.messages ?? []).map((msg) => (
                  <div
                    key={msg.id}
                    className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot size={14} className="text-gray-600" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-4 py-3',
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-gray-100 text-gray-900 rounded-tl-sm',
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <p
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.role === 'assistant' && (msg.model || msg.totalTokens) && (
                        <p className="text-xs text-gray-400 mt-1.5">
                          {msg.model} {msg.totalTokens ? `· ${msg.totalTokens} tokens` : ''}
                        </p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User size={14} className="text-blue-600" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {sendMsg.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={14} className="text-gray-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-4">
              {sendMsg.isError && (
                <p className="text-xs text-red-500 mb-2">
                  {(sendMsg.error as Error)?.message ?? 'Failed to send message'}
                </p>
              )}
              <div className="flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] max-h-32"
                  style={{ height: 'auto' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMsg.isPending}
                  className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {sendMsg.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
