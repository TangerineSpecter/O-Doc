import { createContext, useContext } from 'react';
import type { UserInfo } from '../types/api/user';

interface AuthContextValue {
    userInfo: UserInfo | null;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
    userInfo: null,
    isAuthenticated: false
});

export const AuthProvider = AuthContext.Provider;

export const useAuth = () => useContext(AuthContext);
