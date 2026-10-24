import type {CombatEvent,CombatSnapshot} from '../../types/api/combat';
import PartyBattleStage from './PartyBattleStage';
import PartyCombatLog from './PartyCombatLog';
import CombatBattleStage from './CombatBattleStage';
import CombatObservationSidebar from './CombatObservationSidebar';

/** Shared presentation for the live dialog and the fixture review page. */
export default function CombatObservationView({snapshot,events,disconnected=false}:{
    snapshot:CombatSnapshot;events:CombatEvent[];disconnected?:boolean;
}) {
    return <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className={`scrollbar-hide min-h-0 min-w-0 shrink-0 lg:[container-type:size] ${snapshot.party?'lg:overflow-y-auto':'lg:flex lg:items-center lg:justify-center'}`}>
            <>{snapshot.party?<PartyBattleStage key={snapshot.party.id} party={snapshot.party} personalKills={snapshot.result.kills??0}/>:<CombatBattleStage key={snapshot.id} snapshot={snapshot} disconnected={disconnected} fit/>}</>
        </div>
        <div className="scrollbar-hide min-h-0 space-y-3 overflow-y-auto">{snapshot.party&&<PartyCombatLog key={snapshot.party.id} party={snapshot.party}/>}<CombatObservationSidebar key={snapshot.id} snapshot={snapshot} events={events}/></div>
    </div>;
}
