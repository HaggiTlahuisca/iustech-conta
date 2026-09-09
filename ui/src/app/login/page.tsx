'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import Link from 'next/link';

import { useServer } from '@/providers/server-provider';
import { useAuth } from '@/providers/auth-provider';
import { BrandMark } from '@/components/layout/brand-mark';
import { Icon } from '@/components/ui/icon';
import { ApiError, SatApiClient } from '@/lib/api-client';
import { esWeb } from '@/lib/modo';
import {
  ProvisionerError,
  provisionerDisponible,
  provisionLoginPassword,
  provisionSignup,
  provisionOtpSend,
  provisionOtpVerify,
  guardarPerfilSupabase,
  type ProvisionResult,
  type DatosPerfilRegistro,
} from '@/lib/provisioner-client';
import { mensajeDeError } from '@/lib/errores';
import { cn } from '@/lib/utils';

type Vista = 'login' | 'signup';
type Metodo = 'password' | 'codigo';
type Paso = 'form' | 'otp' | 'done';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function mensajeAuth(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof ProvisionerError) return e.detail;
  return mensajeDeError(e);
}

interface ProtocolPayload {
  action?: string;
  code?: string | null;
  error?: string | null;
}

interface DesktopBridge {
  satAgent?: { isDesktop?: boolean };
  satDesktop?: {
    onProtocolActivated?: (cb: (p: ProtocolPayload) => void) => () => void;
  };
}

function desktopBridge(): DesktopBridge {
  if (typeof window === 'undefined') return {};
  return window as unknown as DesktopBridge;
}

export default function LoginPage() {
  const { apiClient, conectar, webSinConexion } = useServer();
  const { refresh } = useAuth();

  const webNecesitaProvision = esWeb() && webSinConexion;

  const adoptarYConectar = useCallback(
    async (r: ProvisionResult) => {
      conectar({ baseUrl: r.base_url, token: r.token });
      if (typeof window !== 'undefined' && r.base_url && !r.base_url.includes(window.location.host)) {
        try {
          const cliente = new SatApiClient(r.base_url);
          await cliente.authAdoptSession(r.session);
        } catch (e) {
          console.warn('No se requirió sincronización con agente local:', e);
        }
      }
    },
    [conectar],
  );

  const [vista, setVista] = useState<Vista>('login');
  const [metodo, setMetodo] = useState<Metodo>('codigo');
  const [paso, setPaso] = useState<Paso>('form');

  // Campos de registro detallado
  const [nombres, setNombres] = useState('');
  const [primerApellido, setPrimerApellido] = useState('');
  const [segundoApellido, setSegundoApellido] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [rfc, setRfc] = useState('');
  const [telefono, setTelefono] = useState('');

  // Credenciales
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [esDesktop, setEsDesktop] = useState(false);
  const [googleEsperando, setGoogleEsperando] = useState(false);

  const esLogin = vista === 'login';
  const esPwd = metodo === 'password';

  // Lógica de inhabilitación mutua entre persona física y moral
  const tieneDatosFisica =
    nombres.trim().length > 0 ||
    primerApellido.trim().length > 0 ||
    segundoApellido.trim().length > 0;
  const tieneDatosMoral = razonSocial.trim().length > 0;

  const esMoral = tieneDatosMoral;
  const esFisica = tieneDatosFisica;

  const rfcLongitudEsperada = esMoral ? 12 : 13;

  const cambiarVista = useCallback((v: Vista) => {
    setVista(v);
    setMetodo('codigo');
    setPaso('form');
    setPassword('');
    setError(null);
  }, []);

  const cambiarMetodo = useCallback((m: Metodo) => {
    setMetodo(m);
    setError(null);
  }, []);

  useEffect(() => {
    if (paso !== 'done') return;
    const t = setTimeout(() => {
      refresh();
    }, 900);
    return () => clearTimeout(t);
  }, [paso, refresh]);

  const manejarCodigoGoogle = useCallback(
    async (code: string) => {
      setError(null);
      setGoogleEsperando(true);
      try {
        await apiClient.authOauthCallback(code);
        setGoogleEsperando(false);
        setPaso('done');
      } catch (err) {
        setGoogleEsperando(false);
        setError(mensajeAuth(err));
      }
    },
    [apiClient],
  );

  useEffect(() => {
    const b = desktopBridge();
    setEsDesktop(!!b.satAgent?.isDesktop);
    const suscribir = b.satDesktop?.onProtocolActivated;
    if (!suscribir) return;
    return suscribir((p) => {
      if (p?.action !== 'auth-callback') return;
      if (p.code) {
        void manejarCodigoGoogle(p.code);
      } else {
        setGoogleEsperando(false);
        setError('No se pudo continuar con Google. Intenta de nuevo.');
      }
    });
  }, [manejarCodigoGoogle]);

  const iniciarGoogle = useCallback(async () => {
    setError(null);
    setGoogleEsperando(true);
    try {
      const { url } = await apiClient.authOauthStart('google');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setGoogleEsperando(false);
      setError(mensajeAuth(err));
    }
  }, [apiClient]);

  const loginConPassword = useCallback(
    async (correo: string, pwd: string) => {
      if (webNecesitaProvision) {
        await adoptarYConectar(await provisionLoginPassword(correo, pwd));
      } else {
        await apiClient.authLoginPassword(correo, pwd);
      }
    },
    [webNecesitaProvision, adoptarYConectar, apiClient],
  );

  const enviarOtp = useCallback(
    async (correo: string) => {
      if (webNecesitaProvision) {
        await provisionOtpSend(correo);
      } else {
        await apiClient.authOtpSend(correo, { crearCuenta: !esLogin });
      }
    },
    [webNecesitaProvision, apiClient, esLogin],
  );

  const guardarDatosPerfil = useCallback(
    async (token: string, userId: string) => {
      const tipo_persona = esMoral ? 'moral' : 'fisica';
      const datos: DatosPerfilRegistro = {
        tipo_persona,
        nombres: tipo_persona === 'fisica' ? nombres.trim() : null,
        primer_apellido: tipo_persona === 'fisica' ? primerApellido.trim() : null,
        segundo_apellido: tipo_persona === 'fisica' ? segundoApellido.trim() : null,
        razon_social: tipo_persona === 'moral' ? razonSocial.trim() : null,
        rfc: rfc.trim().toUpperCase(),
        telefono: telefono.trim(),
        correo: email.trim().toLowerCase(),
      };
      await guardarPerfilSupabase(token, userId, datos);
    },
    [esMoral, nombres, primerApellido, segundoApellido, razonSocial, rfc, telefono, email],
  );

  const verificarOtp = useCallback(
    async (correo: string, codigo: string) => {
      if (webNecesitaProvision) {
        const r = await provisionOtpVerify(correo, codigo);
        if (!esLogin && r.session.access_token && r.session.user_id) {
          await guardarDatosPerfil(r.session.access_token, r.session.user_id);
        }
        await adoptarYConectar(r);
      } else {
        await apiClient.authOtpVerify(correo, codigo, esLogin ? 'email' : 'signup');
      }
    },
    [webNecesitaProvision, esLogin, guardarDatosPerfil, adoptarYConectar, apiClient],
  );

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const correo = email.trim();
      if (!EMAIL_RE.test(correo)) {
        setError('Escribe un correo electrónico válido.');
        return;
      }

      if (!esLogin) {
        if (!tieneDatosFisica && !tieneDatosMoral) {
          setError('Llena tu nombre y apellidos o la razón social de tu despacho.');
          return;
        }
        if (tieneDatosFisica) {
          if (!nombres.trim() || !primerApellido.trim() || !segundoApellido.trim()) {
            setError('Para persona física, ingresa nombre(s), primer apellido y segundo apellido.');
            return;
          }
        }
        if (tieneDatosMoral && !razonSocial.trim()) {
          setError('Escribe la razón social de la empresa o despacho.');
          return;
        }

        const rfcLimpio = rfc.trim().toUpperCase();
        if (rfcLimpio.length !== rfcLongitudEsperada) {
          setError(
            `El RFC para persona ${esMoral ? 'moral' : 'física'} debe tener exactamente ${rfcLongitudEsperada} caracteres.`,
          );
          return;
        }

        if (telefono.replace(/\D/g, '').length < 10) {
          setError('Ingresa un número de celular a 10 dígitos.');
          return;
        }
      }

      setError(null);
      setLoading(true);

      try {
        if (esLogin && esPwd) {
          if (!password) {
            setError('Escribe tu contraseña.');
            return;
          }
          await loginConPassword(correo, password);
          setPaso('done');
        } else if (esLogin) {
          await enviarOtp(correo);
          setPaso('otp');
        } else if (esPwd) {
          if (password.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres.');
            return;
          }
          const nombreCompleto = esMoral
            ? razonSocial.trim()
            : `${nombres.trim()} ${primerApellido.trim()} ${segundoApellido.trim()}`.trim();

          if (webNecesitaProvision) {
            const r = await provisionSignup(correo, password, nombreCompleto);
            if (r.requiere_confirmacion) {
              setPaso('otp');
            } else if (r.result) {
              await guardarDatosPerfil(r.result.session.access_token, r.result.session.user_id);
              await adoptarYConectar(r.result);
              setPaso('done');
            }
          } else {
            const r = await apiClient.authSignup(correo, password, nombreCompleto);
            if (r.requiere_confirmacion) {
              setPaso('otp');
            } else {
              setPaso('done');
            }
          }
        } else {
          await enviarOtp(correo);
          setPaso('otp');
        }
      } catch (err) {
        setError(mensajeAuth(err));
      } finally {
        setLoading(false);
      }
    },
    [
      email,
      esLogin,
      tieneDatosFisica,
      tieneDatosMoral,
      nombres,
      primerApellido,
      segundoApellido,
      razonSocial,
      rfc,
      rfcLongitudEsperada,
      esMoral,
      telefono,
      esPwd,
      password,
      loginConPassword,
      enviarOtp,
      webNecesitaProvision,
      guardarDatosPerfil,
      adoptarYConectar,
      apiClient,
    ],
  );

  return (
    <div className="flex min-h-full justify-center bg-background px-6 pb-10 pt-10">
      <div className="w-full max-w-lg">
        {paso === 'done' ? (
          <DoneStep esLogin={esLogin} />
        ) : paso === 'otp' ? (
          <OtpStep
            email={email.trim()}
            esLogin={esLogin}
            verificar={(codigo) => verificarOtp(email.trim(), codigo)}
            reenviar={() => enviarOtp(email.trim())}
            onVolver={() => {
              setPaso('form');
              setError(null);
            }}
            onExito={() => setPaso('done')}
          />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
            <Marca />
            <h1 className="mb-6 text-center">
              <span className="block text-[26px] font-bold leading-[1.22] tracking-[-0.02em] text-foreground">
                {esLogin ? 'Bienvenido de vuelta.' : 'Crea tu cuenta de despacho.'}
              </span>
              <span className="block text-[15px] font-medium leading-relaxed text-muted-foreground">
                {esLogin
                  ? 'Inicia sesión en IusTechConta'
                  : 'Regístrate como persona física o moral para empezar'}
              </span>
            </h1>

            <form onSubmit={submit} noValidate>
              {!esLogin && (
                <div className="space-y-4 mb-4 rounded-xl border border-border/80 bg-card/50 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Datos del titular o despacho
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Campo label="Nombre(s)" htmlFor="reg-nombres">
                      <TxtInput
                        id="reg-nombres"
                        disabled={tieneDatosMoral}
                        placeholder="Ej. Juan Carlos"
                        value={nombres}
                        onChange={(v) => setNombres(v)}
                      />
                    </Campo>
                    <Campo label="Primer apellido" htmlFor="reg-ap1">
                      <TxtInput
                        id="reg-ap1"
                        disabled={tieneDatosMoral}
                        placeholder="Ej. Pérez"
                        value={primerApellido}
                        onChange={(v) => setPrimerApellido(v)}
                      />
                    </Campo>
                    <Campo label="Segundo apellido" htmlFor="reg-ap2">
                      <TxtInput
                        id="reg-ap2"
                        disabled={tieneDatosMoral}
                        placeholder="Ej. López"
                        value={segundoApellido}
                        onChange={(v) => setSegundoApellido(v)}
                      />
                    </Campo>
                  </div>

                  <div className="relative my-2 flex items-center justify-center">
                    <span className="absolute inset-x-0 h-px bg-border/60" />
                    <span className="relative bg-card px-2.5 text-[11px] font-semibold text-muted-foreground">
                      O bien, razón social
                    </span>
                  </div>

                  <Campo
                    label="Razón social"
                    htmlFor="reg-razon"
                    help={
                      tieneDatosFisica
                        ? 'Inhabilitado porque ingresaste nombre y apellidos de persona física.'
                        : undefined
                    }
                  >
                    <TxtInput
                      id="reg-razon"
                      disabled={tieneDatosFisica}
                      placeholder="Ej. Despacho Contable Fiscal SC"
                      value={razonSocial}
                      onChange={(v) => setRazonSocial(v)}
                    />
                  </Campo>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo
                      label={`RFC (${rfcLongitudEsperada} caracteres)`}
                      htmlFor="reg-rfc"
                      help={
                        esMoral
                          ? 'RFC de persona moral (12 caracteres)'
                          : 'RFC de persona física (13 caracteres)'
                      }
                    >
                      <TxtInput
                        id="reg-rfc"
                        placeholder={esMoral ? 'AAA010101AAA' : 'AAAA010101AAA'}
                        value={rfc}
                        maxLength={rfcLongitudEsperada}
                        onChange={(v) =>
                          setRfc(v.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, '').slice(0, rfcLongitudEsperada))
                        }
                      />
                    </Campo>

                    <Campo label="Número de celular" htmlFor="reg-tel">
                      <TxtInput
                        id="reg-tel"
                        type="tel"
                        placeholder="10 dígitos"
                        value={telefono}
                        maxLength={10}
                        onChange={(v) => setTelefono(v.replace(/\D/g, '').slice(0, 10))}
                      />
                    </Campo>
                  </div>
                </div>
              )}

              <Campo
                label="Correo electrónico"
                htmlFor="login-email"
                help={
                  !esPwd
                    ? esLogin
                      ? 'Te enviaremos un código de acceso de 6 dígitos a tu correo.'
                      : 'Te enviaremos un código de 6 dígitos para confirmar tu correo.'
                    : undefined
                }
              >
                <TxtInput
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tucorreo@despacho.mx"
                  value={email}
                  onChange={(v) => setEmail(v)}
                />
              </Campo>

              {esPwd && (
                <div className="animate-in fade-in slide-in-from-bottom-1 mb-4.5 duration-200">
                  <label
                    htmlFor="login-pwd"
                    className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-semibold text-foreground"
                  >
                    <span>{esLogin ? 'Contraseña' : 'Crea una contraseña'}</span>
                    {esLogin && (
                      <button
                        type="button"
                        className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
                        onClick={() => cambiarMetodo('codigo')}
                        title="Entra con un código a tu correo"
                      >
                        ¿La olvidaste?
                      </button>
                    )}
                  </label>
                  <div className="relative flex items-center">
                    <TxtInput
                      id="login-pwd"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete={esLogin ? 'current-password' : 'new-password'}
                      placeholder={esLogin ? 'Tu contraseña' : 'Mínimo 8 caracteres'}
                      value={password}
                      onChange={(v) => setPassword(v)}
                      className="pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 flex size-9 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-muted-foreground"
                      title={showPwd ? 'Ocultar' : 'Mostrar'}
                      aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowPwd((s) => !s)}
                    >
                      <Icon
                        icon={showPwd ? 'ph:eye-slash-light' : 'ph:eye-light'}
                        className="size-4.5"
                      />
                    </button>
                  </div>
                </div>
              )}

              {error && <ErrorInline mensaje={error} />}

              <BotonPrimario loading={loading}>
                {esLogin ? (esPwd ? 'Iniciar sesión' : 'Continuar') : 'Crear cuenta'}
              </BotonPrimario>

              <button
                type="button"
                className="mt-4 block w-full text-center text-[13.5px] font-medium text-primary hover:underline"
                onClick={() => cambiarMetodo(esPwd ? 'codigo' : 'password')}
              >
                {esLogin
                  ? esPwd
                    ? 'Ingresar con código de acceso'
                    : 'Prefiero usar mi contraseña'
                  : esPwd
                    ? 'Crear cuenta con código de acceso'
                    : 'Prefiero crear una contraseña'}
              </button>
            </form>

            <Divider>{esLogin ? 'o continúa con' : 'o regístrate con'}</Divider>

            {esDesktop ? (
              <>
                <button
                  type="button"
                  onClick={iniciarGoogle}
                  disabled={googleEsperando}
                  className="flex h-11.5 w-full items-center justify-center gap-2.5 rounded-lg border border-input bg-card text-[15px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60 dark:bg-secondary dark:hover:bg-secondary/80"
                >
                  {googleEsperando ? (
                    <>
                      <Icon icon="ph:circle-notch-light" className="size-4.5 animate-spin" />
                      Conectando con Google…
                    </>
                  ) : (
                    <>
                      <GoogleG />
                      Google
                    </>
                  )}
                </button>
                {googleEsperando && (
                  <p className="mt-2 text-center text-[13px] text-muted-foreground">
                    Continúa en la ventana de tu navegador.{' '}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setGoogleEsperando(false)}
                    >
                      Cancelar
                    </button>
                  </p>
                )}
              </>
            ) : (
              <span title="Próximamente" className="block">
                <button
                  type="button"
                  disabled
                  className="flex h-11.5 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-lg border border-input bg-card text-[15px] font-semibold text-foreground opacity-50 dark:bg-secondary"
                >
                  <GoogleG />
                  Google
                </button>
              </span>
            )}

            <div className="mt-7 text-center">
              <p className="text-sm text-muted-foreground">
                {esLogin ? '¿Primera vez?' : '¿Ya tienes cuenta?'}{' '}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => cambiarVista(esLogin ? 'signup' : 'login')}
                >
                  {esLogin ? 'Crea tu cuenta' : 'Inicia sesión'}
                </button>
              </p>
              <p className="mt-7 border-t border-border/60 pt-5 text-xs leading-relaxed text-muted-foreground/80">
                {esLogin ? 'Al continuar' : 'Al crear tu cuenta'}, aceptas los{' '}
                <LinkExterno href="https://iustechconta.com/terminos">
                  Términos y condiciones
                </LinkExterno>{' '}
                y la{' '}
                <LinkExterno href="https://iustechconta.com/privacidad">
                  Política de privacidad
                </LinkExterno>{' '}
                de IusTechConta.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const OTP_LEN = 6;
const RESEND_SECS = 30;

function OtpStep({
  email,
  esLogin,
  verificar: verificarCodigo,
  reenviar: reenviarCodigo,
  onVolver,
  onExito,
}: {
  email: string;
  esLogin: boolean;
  verificar: (codigo: string) => Promise<void>;
  reenviar: () => Promise<void>;
  onVolver: () => void;
  onExito: () => void;
}) {
  const [vals, setVals] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [secs, setSecs] = useState(RESEND_SECS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const setAt = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setVals((prev) => {
      const n = [...prev];
      n[i] = d;
      return n;
    });
    if (d && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !vals[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!digits) return;
    e.preventDefault();
    setVals(digits.split('').concat(Array(OTP_LEN - digits.length).fill('')));
    refs.current[Math.min(digits.length, OTP_LEN - 1)]?.focus();
  };

  const completo = vals.every(Boolean);

  const verificar = async () => {
    setError(null);
    setLoading(true);
    try {
      await verificarCodigo(vals.join(''));
      onExito();
    } catch (e) {
      setError(mensajeAuth(e));
    } finally {
      setLoading(false);
    }
  };

  const reenviar = async () => {
    setError(null);
    try {
      await reenviarCodigo();
      setSecs(RESEND_SECS);
      setVals(Array(OTP_LEN).fill(''));
      refs.current[0]?.focus();
    } catch (e) {
      setError(mensajeAuth(e));
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        onClick={onVolver}
      >
        <Icon icon="ph:arrow-left-light" className="size-4" />
        Volver
      </button>
      <Marca />
      <h1 className="mb-7 text-center">
        <span className="block text-[26px] font-bold leading-[1.22] tracking-[-0.02em] text-foreground">
          Revisa tu correo
        </span>
        <span className="mt-2 block text-[15px] font-medium leading-relaxed text-muted-foreground">
          Enviamos un código de 6 dígitos a
          <br />
          <span className="font-semibold text-foreground">{email}</span>
        </span>
      </h1>

      <div className="flex justify-between gap-2.5">
        {vals.map((v, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="h-14 w-full rounded-[9px] border border-input bg-card text-center font-mono text-[22px] font-semibold text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/15 dark:bg-secondary"
            inputMode="numeric"
            maxLength={1}
            value={v}
            aria-label={`Dígito ${i + 1} de ${OTP_LEN}`}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={onPaste}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorInline mensaje={error} />
        </div>
      )}

      <div className="mt-5">
        <BotonPrimario loading={loading} disabled={!completo} onClick={verificar} type="button">
          {esLogin ? 'Verificar e iniciar sesión' : 'Verificar y crear cuenta'}
        </BotonPrimario>
      </div>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        ¿No te llegó?{' '}
        {secs > 0 ? (
          <span>Reenviar en 0:{String(secs).padStart(2, '0')}</span>
        ) : (
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={reenviar}
          >
            Reenviar código
          </button>
        )}
      </p>
    </div>
  );
}

function DoneStep({ esLogin }: { esLogin: boolean }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 py-16 text-center duration-200">
      <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon icon="ph:check-light" className="size-8" />
      </span>
      <h3 className="text-xl font-semibold text-foreground">
        {esLogin ? 'Sesión iniciada' : 'Cuenta creada'}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {esLogin ? 'Abriendo tu espacio de trabajo…' : 'Preparando tu espacio de trabajo…'}
      </p>
    </div>
  );
}

function Marca() {
  return (
    <div className="mb-6 flex justify-center">
      <BrandMark size={46} wordmarkSize={24} priority iconClassName="rounded-xl shadow-sm" />
    </div>
  );
}

function Campo({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-2">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {help && (
        <p className="mt-1 px-0.5 text-xs leading-normal text-muted-foreground/80">{help}</p>
      )}
    </div>
  );
}

function TxtInput({
  onChange,
  className,
  disabled,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'className'> & {
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      {...rest}
      disabled={disabled}
      className={cn(
        'h-11 w-full rounded-lg border border-input bg-card px-3.5 text-[14.5px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-primary focus:ring-[3px] focus:ring-primary/15 dark:bg-secondary',
        disabled && 'cursor-not-allowed opacity-40 bg-muted/60',
        className,
      )}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function BotonPrimario({
  children,
  loading = false,
  disabled = false,
  type = 'submit',
  onClick,
}: {
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className="mt-3 flex h-11.5 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-55"
    >
      {loading ? (
        <Icon icon="ph:circle-notch-light" className="size-4 animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3.5 text-[13px] text-muted-foreground/80">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function ErrorInline({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] leading-snug text-destructive"
    >
      {mensaje}
    </p>
  );
}

function LinkExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground underline hover:text-foreground"
    >
      {children}
    </a>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="size-4.75">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
