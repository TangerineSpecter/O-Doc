import {useEffect, useState} from 'react';
import {getTravels, getInventory} from '../api/travel';
import type {TravelJourney, InventoryItem} from '../types/api/travel';

export function useAgentTravel(agentId: string) {
    const [travels, setTravels] = useState<TravelJourney[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let live = true;
        setLoading(true);
        setTravels([]); setInventory([]);
        const reload = () => Promise.all([getTravels(agentId, controller.signal), getInventory(agentId, controller.signal)])
            .then(([journeys, items]) => {if (live) {setTravels(journeys); setInventory(items); setError('');}})
            .catch(e => {if (live) setError(e instanceof Error ? e.message : '旅行数据加载失败');})
            .finally(() => {if (live) setLoading(false);});
        void reload();
        const timer = setInterval(() => {void reload();}, 15000);
        return () => {live = false; controller.abort(); clearInterval(timer);};
    }, [agentId, revision]);
    return {travels, inventory, loading, error, reload: () => setRevision(value => value+1)};
}
