import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Underline, Undo2, Unlink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Texteditor für formatierte Texte der Hauptseite (Absätze, Zwischenüberschriften, Listen, fett, kursiv, Links).
 * Gespeichert wird HTML; der Server filtert es noch einmal streng.
 */
export function RichText({ value, onChange, label, minHeight = 160 }: { value: string; onChange: (html: string) => void; label: string; minHeight?: number }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
    ],
    content: value,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'rt__area', 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // Inhalt von außen geändert (z. B. Fassung zurückgeholt): übernehmen, ohne erneut zu speichern
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML() && !(value === '' && editor.isEmpty)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;
  const btn = (title: string, Icon: LucideIcon, active: boolean, run: () => void, disabled = false) => (
    <button type="button" className={`rt__btn${active ? ' is-active' : ''}`} title={title} aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      <Icon size={15} aria-hidden />
    </button>
  );
  const setLink = () => {
    const current = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link-Adresse (z. B. https://…, /hilfe/, mailto:…). Leer lassen zum Entfernen:', current ?? 'https://');
    if (href === null) return;
    if (href.trim() === '' || href.trim() === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };
  const c = () => editor.chain().focus();
  return (
    <div className="rt">
      <div className="rt__bar" role="toolbar" aria-label={`Formatierung: ${label}`}>
        {btn('Zwischenüberschrift', Heading2, editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
        {btn('Kleine Überschrift', Heading3, editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run())}
        <span className="rt__sep" />
        {btn('Fett', Bold, editor.isActive('bold'), () => c().toggleBold().run())}
        {btn('Kursiv', Italic, editor.isActive('italic'), () => c().toggleItalic().run())}
        {btn('Unterstrichen', Underline, editor.isActive('underline'), () => c().toggleUnderline().run())}
        <span className="rt__sep" />
        {btn('Aufzählung', List, editor.isActive('bulletList'), () => c().toggleBulletList().run())}
        {btn('Nummerierte Liste', ListOrdered, editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
        {btn('Zitat', Quote, editor.isActive('blockquote'), () => c().toggleBlockquote().run())}
        {btn('Trennlinie', Minus, false, () => c().setHorizontalRule().run())}
        <span className="rt__sep" />
        {btn('Link setzen', Link2, editor.isActive('link'), setLink)}
        {btn('Link entfernen', Unlink, false, () => c().unsetLink().run(), !editor.isActive('link'))}
        <span className="rt__sep" />
        {btn('Rückgängig', Undo2, false, () => c().undo().run(), !editor.can().undo())}
        {btn('Wiederholen', Redo2, false, () => c().redo().run(), !editor.can().redo())}
      </div>
      <EditorContent editor={editor} style={{ minHeight }} />
    </div>
  );
}
