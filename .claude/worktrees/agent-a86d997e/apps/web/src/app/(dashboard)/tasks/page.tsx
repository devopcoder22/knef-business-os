'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, CheckSquare, MessageSquare, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  creator: { id: string; firstName: string; lastName: string };
  checklists: { isCompleted: boolean }[];
  _count: { subtasks: number; comments: number; checklists: number };
}

interface TaskDetail extends Task {
  comments: {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string };
  }[];
  checklists: { id: string; text: string; isCompleted: boolean; sortOrder: number }[];
  subtasks: { id: string; title: string; status: TaskStatus; priority: TaskPriority }[];
}

interface TasksResponse {
  data: Task[];
  meta: { total: number };
}

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'TODO', label: 'To Do', color: 'bg-gray-100' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100' },
  { status: 'REVIEW', label: 'Review', color: 'bg-purple-100' },
  { status: 'DONE', label: 'Done', color: 'bg-green-100' },
  { status: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100' },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const completedChecklist = task.checklists.filter(c => c.isCompleted).length;
  const totalChecklist = task.checklists.length;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{task.title}</p>
        <span className={cn('flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium', PRIORITY_COLORS[task.priority])}>
          {task.priority}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          {totalChecklist > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare size={11} />
              {completedChecklist}/{totalChecklist}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={11} />
              {task._count.comments}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={cn('flex items-center gap-1', isOverdue ? 'text-red-500' : 'text-gray-400')}>
              <Calendar size={11} />
              {new Date(task.dueDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {task.assignee && (
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
              {task.assignee.firstName[0]}{task.assignee.lastName[0]}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [newChecklist, setNewChecklist] = useState('');

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ['task-detail', taskId],
    queryFn: async () => {
      const res = await api().get<TaskDetail>(`/tasks/${taskId}`);
      return res.data;
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/tasks/${taskId}/comments`, { content: newComment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      setNewComment('');
    },
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: async ({ checklistId, isCompleted }: { checklistId: string; isCompleted: boolean }) => {
      await api().patch(`/tasks/${taskId}/checklists/${checklistId}`, { isCompleted });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => { await api().post(`/tasks/${taskId}/complete`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">Task Detail</h3>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X size={16} />
        </button>
      </div>
      {isLoading || !task ? (
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="font-semibold text-gray-900">{task.title}</h2>
              <span className={cn('flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium', PRIORITY_COLORS[task.priority])}>
                {task.priority}
              </span>
            </div>
            {task.description && <p className="text-sm text-gray-600">{task.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium text-gray-900 mt-0.5">{task.status.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-gray-500">Assignee</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-NG') : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Creator</p>
              <p className="font-medium text-gray-900 mt-0.5">{task.creator.firstName} {task.creator.lastName}</p>
            </div>
          </div>

          {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="w-full py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {completeMutation.isPending ? 'Completing...' : 'Mark as Done'}
            </button>
          )}

          {/* Checklist */}
          {task.checklists.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Checklist ({task.checklists.filter(c => c.isCompleted).length}/{task.checklists.length})
              </p>
              <div className="space-y-2">
                {task.checklists.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => toggleChecklistMutation.mutate({ checklistId: item.id, isCompleted: !item.isCompleted })}
                      className="rounded text-blue-600"
                    />
                    <span className={cn('text-sm', item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700')}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Comments ({task.comments.length})
            </p>
            <div className="space-y-3">
              {task.comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-900">
                      {comment.user.firstName} {comment.user.lastName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(comment.createdAt).toLocaleDateString('en-NG')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{comment.content}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={e => { if (e.key === 'Enter' && newComment.trim()) addCommentMutation.mutate(); }}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => addCommentMutation.mutate()}
                disabled={addCommentMutation.isPending || !newComment.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TasksContent() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as TaskPriority,
    status: 'TODO' as TaskStatus,
    dueDate: '',
  });

  const { data, isLoading } = useQuery<TasksResponse>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api().get<TasksResponse>('/tasks?limit=200');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/tasks', {
        ...createForm,
        dueDate: createForm.dueDate || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreateTask(false);
      setCreateForm({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', dueDate: '' });
    },
  });

  const tasks = data?.data ?? [];
  const tasksByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = tasks.filter(t => t.status === col.status);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>,
  );

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 text-sm mt-1">Manage team tasks and assignments</p>
        </div>
        <button
          onClick={() => setShowCreateTask(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.status] ?? [];
          return (
            <div key={col.status} className="flex-shrink-0 w-72">
              <div className={cn('flex items-center justify-between px-3 py-2 rounded-lg mb-2', col.color)}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</span>
                <span className="text-xs text-gray-500 font-medium">{colTasks.length}</span>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                    ))
                  : colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => setSelectedTaskId(task.id)}
                      />
                    ))}
                {!isLoading && colTasks.length === 0 && (
                  <div className="py-8 text-center text-gray-300 text-xs">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task detail side panel */}
      {selectedTaskId && (
        <TaskPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Create task modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Create Task</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={createForm.status} onChange={e => setCreateForm(f => ({ ...f, status: e.target.value as TaskStatus }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="REVIEW">Review</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={createForm.dueDate}
                  onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateTask(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !createForm.title.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <TasksContent />
    </Suspense>
  );
}
