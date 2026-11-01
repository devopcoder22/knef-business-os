'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2 } from 'lucide-react';
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
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        class: cn('prose prose-sm max-w-none px-3 py-2 text-sm text-gray-800 focus:outline-none', minHeight),
      },
    },
  });

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

  const Sep = () => <div className="w-px h-4 bg-gray-200 mx-0.5" />;

  const headingValue = editor?.isActive('heading', { level: 1 }) ? '1'
    : editor?.isActive('heading', { level: 2 }) ? '2'
    : editor?.isActive('heading', { level: 3 }) ? '3'
    : '0';

  return (
    <div className={cn('border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500', className)}>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
        {/* Heading select */}
        <select
          value={headingValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '0') editor?.chain().focus().setParagraph().run();
            else editor?.chain().focus().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
          }}
          className="text-xs px-1.5 py-1 rounded border border-gray-200 bg-white text-gray-700 focus:outline-none mr-0.5"
        >
          <option value="0">Normal</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <Sep />
        {btn(!!editor?.isActive('bold'), () => editor?.chain().focus().toggleBold().run(), <Bold size={13} />, 'Bold')}
        {btn(!!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(), <Italic size={13} />, 'Italic')}
        {btn(!!editor?.isActive('underline'), () => editor?.chain().focus().toggleUnderline().run(), <UnderlineIcon size={13} />, 'Underline')}
        {btn(!!editor?.isActive('strike'), () => editor?.chain().focus().toggleStrike().run(), <Strikethrough size={13} />, 'Strikethrough')}
        <Sep />
        {btn(!!editor?.isActive({ textAlign: 'left' }), () => editor?.chain().focus().setTextAlign('left').run(), <AlignLeft size={13} />, 'Align left')}
        {btn(!!editor?.isActive({ textAlign: 'center' }), () => editor?.chain().focus().setTextAlign('center').run(), <AlignCenter size={13} />, 'Align center')}
        {btn(!!editor?.isActive({ textAlign: 'right' }), () => editor?.chain().focus().setTextAlign('right').run(), <AlignRight size={13} />, 'Align right')}
        <Sep />
        {btn(!!editor?.isActive('bulletList'), () => editor?.chain().focus().toggleBulletList().run(), <List size={13} />, 'Bullet list')}
        {btn(!!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), <ListOrdered size={13} />, 'Numbered list')}
        <Sep />
        {btn(false, () => editor?.chain().focus().undo().run(), <Undo2 size={13} />, 'Undo')}
        {btn(false, () => editor?.chain().focus().redo().run(), <Redo2 size={13} />, 'Redo')}
      </div>
      {!editor && placeholder && (
        <div className={cn('px-3 py-2 text-sm text-gray-400', minHeight)}>{placeholder}</div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
