import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import CombatDialog from '../../src/components/Combat/CombatDialog';
function Fixture() {
    const [open,setOpen] = useState(true);
    return <><button onClick={() => setOpen(true)}>打开冒险</button>{open && <CombatDialog residents={[{id:'combat-fixture-0',name:'探险者'},{id:'combat-fixture-1',name:'观察员'}]} onClose={() => setOpen(false)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
