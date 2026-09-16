import { createRoot } from 'react-dom/client';
import { Editor } from '../../src/editor/Editor';
import { chromeEditorPlatform } from '../../src/platform/chrome-editor-platform';
import { loadAnnotationFonts } from '../../src/editor/annotation-font';
import '../../src/editor/annotation-font.css';
import '../../src/ui/base.css';
import '../../src/editor/editor.css';

const root = document.getElementById('root')!;
void loadAnnotationFonts().then(
  () => createRoot(root).render(<Editor platform={chromeEditorPlatform} />),
  () => {
    root.setAttribute('role', 'alert');
    root.textContent = 'The bundled annotation font could not load. Reopen the editor to retry.';
  },
);
