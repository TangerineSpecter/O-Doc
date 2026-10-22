import {localMode} from '../config/development';

// Demo login must never overwrite or clear the real development login.
const prefix = localMode ? 'odoc:local:' : '';
const TOKEN_KEY = `${prefix}token`;
const TOKEN_EXPIRES_AT_KEY = `${prefix}tokenExpiresAt`;
const REMEMBER_ME_KEY = `${prefix}rememberMe`;
const REMEMBERED_ACCOUNT_KEY = `${prefix}rememberedAccount`;
const STANDARD_LOGIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const saveRememberedAccount = (account: string) => {
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, account);
};

export const getRememberedAccount = (): string => {
    return localStorage.getItem(REMEMBERED_ACCOUNT_KEY) || '';
};

export const clearRememberedAccount = () => {
    localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
};

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
