import { useNavigate } from 'react-router-dom';
import './AgentWorldEdgeButton.css';

function AnimatedGlobeIcon() {
    return (
        <svg
            aria-hidden="true"
            className="agent-world-edge-button__globe"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <g className="agent-world-edge-button__orbit">
                <circle className="agent-world-edge-button__orbit-path" cx="12" cy="12" r="10.15" />
                <circle className="agent-world-edge-button__satellite" cx="12" cy="1.85" r="1.25" />
            </g>
            <circle cx="12" cy="12" r="8.1" />
            <ellipse cx="12" cy="12" rx="3.65" ry="8.1" />
            <path d="M4.4 9c2.15 1.05 4.68 1.58 7.6 1.58S17.45 10.05 19.6 9" />
            <path d="M4.4 15c2.15-1.05 4.68-1.58 7.6-1.58s5.45.53 7.6 1.58" />
        </svg>
    );
}

export default function AgentWorldEdgeButton() {
    const navigate = useNavigate();

    return (
        <button
            type="button"
            onClick={() => navigate('/agent-world')}
            title="进入 Agent 世界"
            aria-label="进入 Agent 世界"
            className="agent-world-edge-button group fixed right-0 top-[calc(50%+56px)] z-[80] -translate-y-1/2 cursor-pointer select-none active:scale-95 transition-transform duration-150"
        >
            <span className="agent-world-edge-button__surface">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <AnimatedGlobeIcon />
                </span>
                <span className="agent-world-edge-button__label" aria-hidden="true">
                    <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide text-emerald-700 shadow-sm whitespace-nowrap">
                        Agent 世界
                    </span>
                </span>
            </span>
        </button>
    );
}
