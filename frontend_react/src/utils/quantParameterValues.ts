/** Literal categorical values only. Matches the backend's Unicode character bound. */
export function isParameterText(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const characters = [...value];
    return characters.length <= 200 && characters.every(char => char.charCodeAt(0) >= 32);
}
