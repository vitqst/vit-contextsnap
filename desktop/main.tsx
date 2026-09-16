import { createRoot } from 'react-dom/client';
import { Editor } from '../src/editor/Editor';
import { desktopPlatform } from './platform';
import '../src/ui/base.css';
import '../src/editor/editor.css';
import './desktop.css';

createRoot(document.getElementById('root')!).render(<Editor platform={desktopPlatform} />);
