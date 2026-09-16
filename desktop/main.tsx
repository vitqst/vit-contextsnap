import { createRoot } from 'react-dom/client';
import { Editor } from '../src/editor/Editor';
import { desktopPlatform } from './platform';
import { loadAnnotationFonts } from '../src/editor/annotation-font';
import '../src/editor/annotation-font.css';
import '../src/ui/base.css';
import '../src/editor/editor.css';
import './desktop.css';

const root = document.getElementById('root')!;
void loadAnnotationFonts().then(
  () => createRoot(root).render(<Editor platform={desktopPlatform} />),
  () => {
    root.setAttribute('role', 'alert');
    root.textContent = 'The bundled annotation font could not load. Reopen the app to retry.';
  },
);
