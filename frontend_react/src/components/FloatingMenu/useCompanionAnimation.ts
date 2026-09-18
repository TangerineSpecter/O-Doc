import {useEffect, useRef, useState} from 'react';

export function useCompanionAnimation(isOpen: boolean, playRequest: number) {
    const [frame, setFrame] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [manual, setManual] = useState(false);
    const [cycle, setCycle] = useState(0);
    const previousRequest = useRef(playRequest);
    const wasOpen = useRef(false);

    useEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const timers = new Set<ReturnType<typeof setTimeout>>();
        let busy = false;
        const later = (callback: () => void, delay: number) => {
            const timer = setTimeout(() => {timers.delete(timer); callback();}, delay);
            timers.add(timer);
        };
        const play = (explicit = false) => {
            if (busy || document.hidden || (!explicit && motion.matches)) return;
            busy = true;
            setManual(explicit);
            setCycle(value => value + 1);
            setPlaying(true);
            setFrame(3);
            // These keyframes share the star's 3.2 second timeline.
            later(() => setFrame(4), 480);
            later(() => setFrame(5), 1500);
            later(() => setFrame(6), 2460);
            later(() => {setFrame(0); setPlaying(false); busy = false;}, 3200);
        };
        const requested = previousRequest.current !== playRequest;
        previousRequest.current = playRequest;
        const closing = wasOpen.current && !isOpen;
        wasOpen.current = isOpen;
        later(() => {
            setPlaying(false);
            if (requested && !isOpen) play(true);
            else if (isOpen) {
                setFrame(motion.matches ? 7 : 3);
                if (!motion.matches) later(() => setFrame(7), 180);
            } else if (closing && !motion.matches) {
                setFrame(6);
                later(() => setFrame(0), 300);
            } else setFrame(0);
        }, 0);
        if (!isOpen && !requested) later(() => play(), 7000);
        const idleTimer = setInterval(() => {
            if (isOpen || busy || document.hidden || motion.matches) return;
            setFrame(1);
            later(() => setFrame(0), 140);
        }, 4200);
        const playTimer = setInterval(() => {if (!isOpen) play();}, 17000);
        return () => {
            timers.forEach(clearTimeout);
            clearInterval(idleTimer);
            clearInterval(playTimer);
        };
    }, [isOpen, playRequest]);

    return {frame, playing, manual, cycle};
}
