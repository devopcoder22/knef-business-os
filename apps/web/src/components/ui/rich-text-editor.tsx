'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 'min-h-[100px]', className }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none px-3 py-2 text-sm text-gray-800 focus:outline-none',
          minHeight,
        ),
      },
    },
  });

  // Sync external value changes (e.g. when form prefills on edit page)
  // Only sync if editor content differs from incoming value to avoid cursor jumps
  if (editor && value !== undefined) {
    const current = editor.getHTML();
    if (current !== value && !(current === '<p></p>' && !value)) {
      editor.commands.setContent(value || '');
    }
  }

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'p-1.5 rounded text-sm transition-colors',
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className={cn('border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
        {btn(!!editor?.isActive('bold'), () => editor?.chain().focus().toggleBold().run(), <Bold size={14} />, 'Bold')}
        {btn(!!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(), <Italic size={14} />, 'Italic')}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {btn(!!editor?.isActive('bulletList'), () => editor?.chain().focus().toggleBulletList().run(), <List size={14} />, 'Bullet list')}
        {btn(!!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />, 'Numbered list')}
      </div>
      {/* Editor area */}
      {!editor && placeholder && (
        <div className={cn('px-3 py-2 text-sm text-gray-400', minHeight)}>{placeholder}</div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
