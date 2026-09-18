import {useId} from 'react';

/** Shared illustration for the toy itself and its play control. */
export function StarCharm({className}: {className?: string}) {
    const id = useId();
    return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs>
            <linearGradient id={`${id}-gold`} x1="14" y1="5" x2="33" y2="43" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fff3b5"/><stop offset=".48" stopColor="#ffd56a"/><stop offset="1" stopColor="#f3a343"/>
            </linearGradient>
        </defs>
        <path d="M21.1 7.2Q24 1.8 26.9 7.2L31 15.2L40 16.6Q46 17.4 41.8 21.8L35.4 28.2L36.8 37.3Q37.8 43.4 32.4 40.6L24 36.3L15.6 40.6Q10.2 43.4 11.2 37.3L12.6 28.2L6.2 21.8Q2 17.4 8 16.6L17 15.2Z"
              fill={`url(#${id}-gold)`} stroke="#d79843" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="m10 19 9.2-1.6L23.7 9" stroke="#fff9dc" strokeWidth="2.8" strokeLinecap="round"/>
        <path d="m15 36.5 9-4.2 9 4.2" stroke="#e9a13f" strokeOpacity=".45" strokeWidth="1.4" strokeLinecap="round"/>
        <ellipse cx="19" cy="25" rx="1.45" ry="2" fill="#a96d32"/>
        <ellipse cx="29" cy="25" rx="1.45" ry="2" fill="#a96d32"/>
        <path d="M22 29q2 2.5 4 0" stroke="#a96d32" strokeWidth="1.4" strokeLinecap="round"/>
        <ellipse cx="15.5" cy="28" rx="2.4" ry="1.2" fill="#ed9673" opacity=".55"/>
        <ellipse cx="32.5" cy="28" rx="2.4" ry="1.2" fill="#ed9673" opacity=".55"/>
        <path d="M39 4v6m-3-3h6" stroke="#e7b95e" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>;
}
