const TOKEN_KEY = 'token';
const TOKEN_EXPIRES_AT_KEY = 'tokenExpiresAt';
const REMEMBER_ME_KEY = 'rememberMe';
const STANDARD_LOGIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const saveAuthToken = (token: string, rememberMe: boolean) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
    sessionStorage.removeItem(TOKEN_KEY);

    if (rememberMe) {
        localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
    } else {
        localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + STANDARD_LOGIN_TTL_MS));
    }
};

export const clearAuthToken = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (token) {
        const expiresAt = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
        if (expiresAt && Number(expiresAt) <= Date.now()) {
            clearAuthToken();
            return null;
        }
        return token;
    }

    const legacySessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (legacySessionToken) {
        saveAuthToken(legacySessionToken, false);
        return legacySessionToken;
    }

    return null;
};
