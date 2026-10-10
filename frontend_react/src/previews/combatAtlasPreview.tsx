import {createRoot} from 'react-dom/client';
import CombatAtlasPreviewApp from './CombatAtlasPreviewApp';
import '../index.css';
const root=createRoot(document.getElementById('root')!);
root.render(<CombatAtlasPreviewApp/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
