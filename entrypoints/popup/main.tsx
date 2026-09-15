import { createRoot } from 'react-dom/client';
import { Popup } from '../../src/popup/Popup';
import '../../src/ui/base.css';
import '../../src/popup/popup.css';

createRoot(document.getElementById('root')!).render(<Popup />);
