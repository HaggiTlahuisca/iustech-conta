// ---------------------------------------------------------------------------
// Cliente de autenticación web (Supabase Auth directo):
// Envía y verifica códigos OTP de 6 dígitos, contraseñas y guarda perfiles.
// ---------------------------------------------------------------------------

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1\/?$/, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const PROVISIONER_URL = (process.env.NEXT_PUBLIC_PROVISIONER_URL ?? '').trim().replace(/\/+$/, '');

export interface SesionProvisionada {
  access_token: string;
  refresh_token?: string | null;
  user_id: string;
  email?: string | null;
}

export interface ProvisionResult {
  base_url: string;
  token: string;
  session: SesionProvisionada;
}

export interface DatosPerfilRegistro {
  tipo_persona: 'fisica' | 'moral';
  nombres?: string | null;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
  razon_social?: string | null;
  rfc: string;
  telefono: string;
  correo: string;
}

export class ProvisionerError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ProvisionerError';
  }
}

export function provisionerDisponible(): boolean {
  return PROVISIONER_URL.length > 0 || (SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0);
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROVISIONER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProvisionerError(0, 'No se pudo contactar el servicio. Revisa tu conexión.');
  }
  if (!res.ok) {
    let detail = 'Ocurrió un error. Intenta de nuevo.';
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') detail = data.detail;
    } catch {}
    throw new ProvisionerError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export async function provisionLoginPassword(
  email: string,
  password: string,
): Promise<ProvisionResult> {
  if (PROVISIONER_URL.length > 0) {
    return post<ProvisionResult>('/provision/login-password', { email, password });
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ProvisionerError(0, 'No se pudo contactar el servicio de autenticación.');
  }

  if (!res.ok) {
    let detail = 'Correo o contraseña incorrectos.';
    try {
      const data = await res.json();
      detail = data.msg || data.message || data.error_description || detail;
    } catch {}
    throw new ProvisionerError(res.status, detail);
  }

  const data = await res.json();
  const session: SesionProvisionada = {
    access_token: data.access_token ?? '',
    refresh_token: data.refresh_token ?? null,
    user_id: data.user?.id ?? '',
    email: data.user?.email ?? email,
  };

  return {
    base_url: typeof window !== 'undefined' ? window.location.origin : '',
    token: data.access_token ?? '',
    session,
  };
}

export async function provisionSignup(
  email: string,
  password: string,
  nombre?: string,
): Promise<{ requiere_confirmacion: boolean; result?: ProvisionResult }> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        data: nombre ? { full_name: nombre, name: nombre } : {},
      }),
    });
  } catch {
    throw new ProvisionerError(0, 'No se pudo contactar el servicio de autenticación.');
  }

  if (!res.ok) {
    let detail = 'No se pudo registrar la cuenta.';
    try {
      const data = await res.json();
      detail = data.msg || data.message || data.error_description || detail;
    } catch {}
    throw new ProvisionerError(res.status, detail);
  }

  const data = await res.json();
  if (!data.access_token && !data.session) {
    return { requiere_confirmacion: true };
  }

  const session: SesionProvisionada = {
    access_token: data.access_token ?? data.session?.access_token ?? '',
    refresh_token: data.refresh_token ?? data.session?.refresh_token ?? null,
    user_id: data.user?.id ?? '',
    email: data.user?.email ?? email,
  };

  return {
    requiere_confirmacion: false,
    result: {
      base_url: typeof window !== 'undefined' ? window.location.origin : '',
      token: session.access_token,
      session,
    },
  };
}

export async function provisionOtpSend(email: string): Promise<void> {
  if (PROVISIONER_URL.length > 0) {
    await post<{ ok: boolean }>('/provision/otp-send', { email });
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        create_user: true,
      }),
    });
  } catch {
    throw new ProvisionerError(0, 'No se pudo contactar el servicio de autenticación.');
  }

  if (!res.ok) {
    let detail = 'No se pudo enviar el código de acceso.';
    try {
      const data = await res.json();
      detail = data.msg || data.message || data.error_description || detail;
    } catch {}
    throw new ProvisionerError(res.status, detail);
  }
}

export async function provisionOtpVerify(
  email: string,
  token: string,
): Promise<ProvisionResult> {
  if (PROVISIONER_URL.length > 0) {
    return post<ProvisionResult>('/provision/otp-verify', { email, token });
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'email',
        email,
        token,
      }),
    });
  } catch {
    throw new ProvisionerError(0, 'No se pudo contactar el servicio de autenticación.');
  }

  if (!res.ok) {
    let detail = 'Código incorrecto o expirado.';
    try {
      const data = await res.json();
      detail = data.msg || data.message || data.error_description || detail;
    } catch {}
    throw new ProvisionerError(res.status, detail);
  }

  const data = await res.json();
  const session: SesionProvisionada = {
    access_token: data.access_token ?? '',
    refresh_token: data.refresh_token ?? null,
    user_id: data.user?.id ?? '',
    email: data.user?.email ?? email,
  };

  return {
    base_url: typeof window !== 'undefined' ? window.location.origin : '',
    token: data.access_token ?? '',
    session,
  };
}

export async function guardarPerfilSupabase(
  token: string,
  userId: string,
  perfil: DatosPerfilRegistro,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/perfiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: userId,
        tipo_persona: perfil.tipo_persona,
        nombres: perfil.nombres ?? null,
        primer_apellido: perfil.primer_apellido ?? null,
        segundo_apellido: perfil.segundo_apellido ?? null,
        razon_social: perfil.razon_social ?? null,
        rfc: perfil.rfc.trim().toUpperCase(),
        telefono: perfil.telefono.trim(),
        correo: perfil.correo.trim().toLowerCase(),
        actualizado_el: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('Error al guardar el perfil en Supabase:', e);
  }
}

export function provisionConToken(
  accessToken: string,
  refreshToken?: string | null,
): Promise<ProvisionResult> {
  if (PROVISIONER_URL.length > 0) {
    return post<ProvisionResult>('/provision/con-token', {
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
    });
  }

  const session: SesionProvisionada = {
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    user_id: '',
    email: null,
  };

  return Promise.resolve({
    base_url: typeof window !== 'undefined' ? window.location.origin : '',
    token: accessToken,
    session,
  });
}
