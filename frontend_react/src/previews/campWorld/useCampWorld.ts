import {useCallback, useEffect, useRef, useState} from 'react';
import {CampScene} from './CampScene';
import {CampSimulation} from './simulation';
import type {WorldCommand} from './types';

export function useCampWorld() {
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<CampScene | null>(null);
    const [snapshot, setSnapshot] = useState(() => new CampSimulation().snapshot());
    const [hovered, setHovered] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!host.current) return;
        let active = true;
        setLoading(true); setError('');
        const instance = new CampScene(host.current, {onSnapshot: setSnapshot, onHover: setHovered});
        scene.current = instance;
        void instance.init().then(() => {if (active) setLoading(false);}).catch(reason => {
            if (active) {setError(reason instanceof Error ? reason.message : '营地暂时没能打开，请重试。'); setLoading(false);}
            instance.dispose();
        });
        return () => {active = false; instance.dispose(); scene.current = null;};
    }, [attempt]);
    const command = useCallback((value: WorldCommand) => scene.current?.command(value), []);
    return {host, snapshot, hovered, loading, error, command, retry: () => setAttempt(current => current + 1)};
}
