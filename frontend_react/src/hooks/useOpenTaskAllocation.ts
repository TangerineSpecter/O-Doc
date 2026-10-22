import {useSearchParams} from 'react-router-dom';

/** Preserve local mock scenario and other world navigation parameters. */
export function useOpenTaskAllocation() {
    const [query, setQuery] = useSearchParams();
    return () => {
        const next = new URLSearchParams(query);
        next.set('settings', 'agents');
        next.set('view', 'tasks');
        setQuery(next);
    };
}
