"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, getAccessToken, setTokens } from "./api-client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  roleId: string | null;
  permissions: string[];
  twoFactorEnabled: boolean;
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTwoFactor?: boolean }>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<AuthenticatedUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      clearTokens();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string, totpCode?: string) => {
      const res = await api.post<{ requiresTwoFactor?: boolean; accessToken?: string; refreshToken?: string }>(
        "/auth/login",
        { email, password, totpCode },
      );
      if (res.requiresTwoFactor) return { requiresTwoFactor: true };
      setTokens(res.accessToken!, res.refreshToken!);
      await refreshUser();
      return {};
    },
    [refreshUser],
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.post<{ accessToken: string; refreshToken: string }>("/auth/register", {
        email,
        username,
        password,
      });
      setTokens(res.accessToken, res.refreshToken);
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  const hasPermission = useCallback(
    (perm: string) => !!user && (user.permissions.includes("*") || user.permissions.includes(perm)),
    [user],
  );

  const isAdmin = !!user && user.permissions.includes("*");

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, hasPermission, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous AuthProvider");
  return ctx;
}
