export function TournamentTrophy({className}: {className?: string}) {
    return (
        <div className="tournament-trophy-wrap">
            <img
                src="/assets/tournament/champion-trophy-anime.png"
                alt="武道大会冠军金杯"
                className={className || "tournament-trophy"}
                loading="eager"
            />
        </div>
    );
}
