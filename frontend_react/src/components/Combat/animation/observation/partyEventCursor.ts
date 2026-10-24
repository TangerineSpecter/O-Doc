import type {AdventurePartySnapshot} from '../../../../types/api/combat';

type Events = AdventurePartySnapshot['events'];

/** The initial snapshot is history; only later confirmed events animate. */
export class PartyEventCursor {
    private head:number|null=null;

    take(events:Events):Events {
        const fresh=this.head===null?[]:events.filter(event=>event.sequence>this.head!);
        this.head=Math.max(this.head??0,...events.map(event=>event.sequence));
        return fresh;
    }
}
