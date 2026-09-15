import { createRoot } from 'react-dom/client';
import { Editor } from '../../src/editor/Editor';
import '../../src/ui/base.css';
import '../../src/editor/editor.css';

createRoot(document.getElementById('root')!).render(<Editor />);
