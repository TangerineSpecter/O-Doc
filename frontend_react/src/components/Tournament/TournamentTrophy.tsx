import {useState} from 'react';
import {Trophy} from 'lucide-react';

export function TournamentTrophy({className}: {className?: string}) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="tournament-trophy-wrap">
            {!failed ? (
                <img
                    src="/assets/tournament/champion-trophy-anime.png"
                    alt="武道大会冠军金杯"
                    className={className || "tournament-trophy"}
                    loading="eager"
                    onError={() => setFailed(true)}
                />
            ) : (
                <div className="flex h-16 w-16 items-center justify-center text-amber-500">
                    <Trophy className="h-12 w-12" />
                </div>
            )}
        </div>
    );
}
