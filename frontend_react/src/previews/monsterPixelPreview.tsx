import {createRoot} from 'react-dom/client';
import MonsterPixelPreviewApp from './MonsterPixelPreviewApp';
import '../index.css';
const root = createRoot(document.getElementById('root')!);
root.render(<MonsterPixelPreviewApp />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
