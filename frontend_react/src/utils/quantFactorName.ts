/** Names are presentation only; never rewrite calculation variables or identities. */
export function factorName(name: string, original = ''): {title: string; identifier: string} {
    const split = (value: string) => value.trim().match(/^(.+?)\s*[（(]([A-Za-z_][A-Za-z0-9_.-]*)[）)]$/u);
    const current = split(name), source = split(original);
    const title = current?.[1].trim() || name.trim();
    const identifier = current?.[2] || source?.[2] || (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(original) && original !== title ? original : '');
    return {title, identifier};
}
