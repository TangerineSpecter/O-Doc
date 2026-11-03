import type {DiaryMood} from '../../types/api/diary';
import {MOOD_THEMES} from './diaryBrowse';

export default function DiaryMoodIcon({mood, size = 26}: {mood: DiaryMood; size?: number}) {
    const theme = MOOD_THEMES[mood] || MOOD_THEMES[''];
    return (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" className="shrink-0">
            <circle cx="16" cy="16" r="14" fill={theme.fill} stroke={theme.ring} strokeWidth="1" strokeOpacity="0.45"/>
            <g stroke="#2C2520" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {mood === 'excited' ? (
                    <>
                        <path d="m8 13 3-3 3 3m4 0 3-3 3 3"/>
                        <path d="M11 19h10c-1 7-9 7-10 0Z" fill="#fff"/>
                    </>
                ) : (
                    <>
                        {mood === 'tired' ? (
                            <path d="m8 11 5 5m0-5-5 5m11-5 5 5m0-5-5 5"/>
                        ) : mood === 'calm' ? (
                            <path d="M8 13h5m6 0h5"/>
                        ) : (
                            <>
                                <path d="M11 13v2m10-2v2"/>
                                {mood === 'angry' && <path d="m8 9 6 2m4 0 6-2"/>}
                            </>
                        )}
                        <path
                            d={
                                mood === 'sad' || mood === 'angry'
                                    ? 'M11 23q5-6 10 0'
                                    : mood === 'tired'
                                      ? 'M13 22h6'
                                      : mood === 'calm'
                                        ? 'M13 22h6'
                                        : 'M10 20q6 8 12 0'
                            }
                        />
                    </>
                )}
            </g>
            {mood === 'sad' && <path d="M24 16q-4 5 0 5t0-5" fill="#60a5fa"/>}
        </svg>
    );
}
