import {createRoot} from 'react-dom/client';
import MonsterDefeatPreviewApp from './monsterDefeat/MonsterDefeatPreviewApp';
import '../index.css';
const root=createRoot(document.getElementById('root')!);
root.render(<MonsterDefeatPreviewApp/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
