export interface GitHubReleaseTag {
    version: string;
    tagName: string;
    commit: string;
    checkedAt: number;
}

interface GitHubTagResponse {
    name?: unknown;
    commit?: {
        sha?: unknown;
    };
}

interface ReleaseCacheValue {
    release: GitHubReleaseTag;
    expiresAt: number;
}

const tagsUrl = 'https://api.github.com/repos/TangerineSpecter/O-Doc/tags?per_page=100';
const cacheKey = 'odoc:latest-release-tag:v1';
const cacheDurationMs = 10 * 60 * 1000;
const versionPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const commitPattern = /^[0-9a-f]{40}$/i;

const parseVersion = (value: string): [number, number, number] | null => {
    const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export const compareVersions = (left: string, right: string) => {
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

export const selectLatestStableTag = (tags: GitHubTagResponse[], checkedAt = Date.now()): GitHubReleaseTag | null => {
    const candidates = tags.flatMap((tag) => {
        const name = typeof tag.name === 'string' ? tag.name : '';
        const commit = typeof tag.commit?.sha === 'string' ? tag.commit.sha.toLowerCase() : '';
        const match = name.match(versionPattern);
        if (!match || !commitPattern.test(commit)) return [];
        return [{version: name.slice(1), tagName: name, commit, checkedAt}];
    });

    candidates.sort((left, right) => compareVersions(right.version, left.version));
    return candidates[0] || null;
};

export const isReleaseUpdateAvailable = (
    currentVersion: string,
    currentCommit: string,
    release: GitHubReleaseTag | null,
) => {
    if (!release) return false;
    const versionOrder = compareVersions(release.version, currentVersion);
    if (versionOrder > 0) return true;
    return versionOrder === 0
        && commitPattern.test(currentCommit)
        && release.commit !== currentCommit.toLowerCase();
};

const readCache = (): GitHubReleaseTag | null => {
    if (typeof window === 'undefined') return null;
    try {
        const cached = JSON.parse(window.localStorage.getItem(cacheKey) || '') as ReleaseCacheValue;
        return cached.expiresAt > Date.now() ? cached.release : null;
    } catch {
        return null;
    }
};

const writeCache = (release: GitHubReleaseTag) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(cacheKey, JSON.stringify({
            release,
            expiresAt: Date.now() + cacheDurationMs,
        } satisfies ReleaseCacheValue));
    } catch {
        // localStorage 不可用时仍可使用本次网络结果。
    }
};

export const getLatestReleaseTag = async (force = false): Promise<GitHubReleaseTag> => {
    if (!force) {
        const cached = readCache();
        if (cached) return cached;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(tagsUrl, {
            signal: controller.signal,
            headers: {'Accept': 'application/vnd.github+json'},
        });
        if (!response.ok) throw new Error(`GitHub tags 请求失败（${response.status}）`);
        const tags = await response.json() as GitHubTagResponse[];
        const release = selectLatestStableTag(Array.isArray(tags) ? tags : []);
        if (!release) throw new Error('没有找到有效的稳定版本 tag');
        writeCache(release);
        return release;
    } finally {
        window.clearTimeout(timeout);
    }
};

export const shortCommit = (commit: string) => commit ? commit.slice(0, 8) : 'unknown';
