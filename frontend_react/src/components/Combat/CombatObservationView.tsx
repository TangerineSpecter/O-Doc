import type {CombatEvent,CombatSnapshot} from '../../types/api/combat';
import CombatBattleStage from './CombatBattleStage';
import CombatObservationSidebar from './CombatObservationSidebar';
import type {BattleBackgroundArt} from './art/battleBackgroundArt';

/** Shared presentation for the live dialog and the fixture review page. */
export default function CombatObservationView({snapshot,events,disconnected=false,backgroundCandidate}:{
    snapshot:CombatSnapshot;events:CombatEvent[];disconnected?:boolean;backgroundCandidate?:BattleBackgroundArt;
}) {
    return <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className="min-h-0 min-w-0 shrink-0 lg:flex lg:items-center lg:justify-center lg:[container-type:size]">
            <CombatBattleStage key={snapshot.id} snapshot={snapshot} disconnected={disconnected} fit backgroundCandidate={backgroundCandidate}/>
        </div>
        <CombatObservationSidebar key={snapshot.id} snapshot={snapshot} events={events}/>
    </div>;
}
