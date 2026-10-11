import {createRoot} from 'react-dom/client';
import CombatObservationPreviewApp from './CombatObservationPreviewApp';
import '../index.css';
const root=createRoot(document.getElementById('root')!);
root.render(<CombatObservationPreviewApp/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
