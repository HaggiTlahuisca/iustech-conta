'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useServer } from '@/providers/server-provider';
import { identificarUsuario } from '@/lib/telemetria';
import type { LicenseStatus, DesktopPlan } from '@/lib/api-client';
import { esWeb } from '@/lib/modo';
import { getConexion, clearConexion } from '@/lib/conexion-web';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  /** Estado actual de licencia del usuario. null mientras carga inicial. */
  license: LicenseStatus | null;
  /** True si nunca se ha cargado el estado todavía. */
  loading: boolean;
  /** Re-fetch del backend (force_refresh). Lo llaman botones de "refrescar". */
  refresh: () => Promise<void>;
  /** Logout — limpia keyring/almacenamiento y vuelve a la pantalla de login. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodificarJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function validarSesionSupabase(
  token: string,
): Promise<{ authenticated: boolean; user_id?: string; email?: string | null; plan?: string } | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  const payload = decodificarJwtPayload(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp * 1000 : 0;
  if (exp > 0 && Date.now() > exp) {
    return null;
  }

  if (!supabaseUrl || !anonKey || !token) {
    if (payload?.sub) {
      return {
        authenticated: true,
        user_id: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : null,
        plan: 'gratuito',
      };
    }
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return null;
      if (payload?.sub) {
        return {
          authenticated: true,
          user_id: String(payload.sub),
          email: typeof payload.email === 'string' ? payload.email : null,
          plan: 'gratuito',
        };
      }
      return null;
    }

    const user = await res.json();
    let plan = 'gratuito';

    try {
      const licRes = await fetch(
        `${supabaseUrl}/rest/v1/licencias?usuario_id=eq.${user.id}&select=*&limit=1`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (licRes.ok) {
        const licRows = await licRes.json();
        if (Array.isArray(licRows) && licRows.length > 0 && licRows[0]?.plan) {
          plan = licRows[0].plan;
        }
      }
    } catch {
      // Usar plan gratuito por defecto si la consulta de licencias tarda
    }

    return {
      authenticated: true,
      user_id: user.id,
      email: user.email,
      plan,
    };
  } catch {
    if (payload?.sub && (exp === 0 || Date.now() < exp)) {
      return {
        authenticated: true,
        user_id: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : null,
        plan: 'gratuito',
      };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const { apiClient, isConnected, webSinConexion } = useServer();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (esWeb()) return;
    if (!webSinConexion) return;
    setLicense({ authenticated: false });
    setLoading(false);
  }, [webSinConexion]);

  const latestRequest = useRef(0);

  const fetchLicense = useCallback(
    async (force = false) => {
      const requestId = ++latestRequest.current;
      const sigueVigente = () => requestId === latestRequest.current;

      if (esWeb()) {
        const cx = getConexion();
        if (!cx?.token) {
          if (sigueVigente()) {
            setLicense({ authenticated: false });
            setLoading(false);
          }
          return;
        }

        const user = await validarSesionSupabase(cx.token);
        if (!sigueVigente()) return;

        if (user) {
          const lic: LicenseStatus = {
            authenticated: true,
            user_id: user.user_id,
            email: user.email,
            plan: (user.plan ?? 'gratuito') as unknown as DesktopPlan,
          };
          setLicense(lic);
          identificarUsuario(
            user.user_id ? { id: user.user_id, email: user.email } : null,
          );
        } else {
          setLicense({ authenticated: false });
          identificarUsuario(null);
        }
        setLoading(false);
        return;
      }

      try {
        const data = await apiClient.authLicense(force);
        if (!sigueVigente()) return;
        setLicense(data);
        identificarUsuario(
          data.authenticated ? { id: data.user_id, email: data.email } : null,
        );
        if (data.authenticated) {
          apiClient.autocargarFiel().catch((e) => {
            console.warn('[auth] autocargarFiel falló (no bloqueante):', e);
          });
        }
      } catch (e) {
        console.warn('[auth] authLicense falló:', e);
        if (sigueVigente()) setLicense((prev) => prev ?? { authenticated: false });
      } finally {
        setLoading(false);
      }
    },
    [apiClient],
  );

  useEffect(() => {
    if (esWeb()) {
      void fetchLicense(false);
      return;
    }
    if (!isConnected) return;
    void fetchLicense(false).then(() => fetchLicense(true));
  }, [isConnected, fetchLicense]);

  useEffect(() => {
    if (esWeb()) {
      const interval = setInterval(() => {
        fetchLicense(true);
      }, 6 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
    if (!isConnected) return;
    const interval = setInterval(() => {
      fetchLicense(true);
    }, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isConnected, fetchLicense]);

  const refresh = useCallback(() => fetchLicense(true), [fetchLicense]);

  const logout = useCallback(async () => {
    try {
      if (esWeb()) {
        clearConexion();
      }
      await apiClient.authLogout();
    } catch (e) {
      console.warn('[auth] logout falló:', e);
    }
    setLicense({ authenticated: false });
    setLoading(false);
    identificarUsuario(null);
  }, [apiClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ license, loading, refresh, logout }),
    [license, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}

export function useRequireAuth(): {
  ready: boolean;
  authenticated: boolean;
  license: LicenseStatus | null;
} {
  const { license, loading } = useAuth();
  if (loading || license === null) {
    return { ready: false, authenticated: false, license: null };
  }
  return {
    ready: true,
    authenticated: license.authenticated === true,
    license,
  };
}
