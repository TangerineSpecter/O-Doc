export interface LatestVersionInfo {
    version: string;
    tagName: string;
    commit: string;
    checkedAt: number;
}

interface GitHubTag {
    name?: unknown;
    commit?: {sha?: unknown};
}

interface CachedLatestVersion {
    release: LatestVersionInfo;
    expiresAt: number;
}

const tagsUrl = 'https://api.github.com/repos/TangerineSpecter/O-Doc/tags?per_page=100';
const cacheKey = 'odoc:latest-release-tag:v1';
const cacheDurationMs = 10 * 60 * 1000;
const versionPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const commitPattern = /^[0-9a-f]{40}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const parseVersion = (value: string): [number, number, number] | null => {
    const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const compareVersions = (left: string, right: string) => {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    if (!leftParts || !rightParts) return 0;

    for (let index = 0; index < leftParts.length; index += 1) {
        if (leftParts[index] !== rightParts[index]) {
            return leftParts[index] > rightParts[index] ? 1 : -1;
        }
    }
    return 0;
};

export const isNewerVersion = (candidate: string, current: string) => (
    compareVersions(candidate, current) > 0
);

const selectLatestStableTag = (tags: unknown[], checkedAt: number): LatestVersionInfo | null => {
    const candidates = tags.flatMap((value) => {
        if (!isRecord(value)) return [];
        const tag = value as GitHubTag;
        const name = typeof tag.name === 'string' ? tag.name : '';
        const commit = isRecord(tag.commit) && typeof tag.commit.sha === 'string'
            ? tag.commit.sha.toLowerCase()
            : '';
        const match = name.match(versionPattern);
        if (!match || !commitPattern.test(commit)) return [];
        return [{version: name.slice(1), tagName: name, commit, checkedAt}];
    });

    candidates.sort((left, right) => compareVersions(right.version, left.version));
    return candidates[0] || null;
};

const readCachedLatestVersion = (): LatestVersionInfo | null => {
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(cacheKey) || '');
        if (!isRecord(value) || !isRecord(value.release) || typeof value.expiresAt !== 'number') return null;
        const release = value.release;
        if (
            typeof release.version !== 'string'
            || typeof release.tagName !== 'string'
            || typeof release.commit !== 'string'
            || typeof release.checkedAt !== 'number'
            || value.expiresAt <= Date.now()
        ) return null;
        return release as LatestVersionInfo;
    } catch {
        return null;
    }
};

const writeCachedLatestVersion = (release: LatestVersionInfo) => {
    try {
        window.localStorage.setItem(cacheKey, JSON.stringify({
            release,
            expiresAt: Date.now() + cacheDurationMs,
        } satisfies CachedLatestVersion));
    } catch {
        // Storage may be disabled; the current network result is still usable.
    }
};

export const getLatestVersionInfo = async (
    force = false,
    signal?: AbortSignal,
): Promise<LatestVersionInfo> => {
    if (!force) {
        const cached = readCachedLatestVersion();
        if (cached) return cached;
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abortFromCaller, {once: true});

    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(tagsUrl, {
            signal: controller.signal,
            headers: {'Accept': 'application/vnd.github+json'},
        });
        if (!response.ok) throw new Error(`GitHub tags request failed (${response.status})`);

        const value: unknown = await response.json();
        const latest = selectLatestStableTag(Array.isArray(value) ? value : [], Date.now());
        if (!latest) throw new Error('No stable version tag found');
        writeCachedLatestVersion(latest);
        return latest;
    } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromCaller);
    }
};
