import { useState } from "react";
import { loginRequest } from "@/features/auth/api/client";
import { safeInternalRedirect } from "@/lib/auth/redirect";

type LoginFormProps = {
  redirectTo?: string;
};

export default function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const registerHref =
    redirectTo && redirectTo !== "/"
      ? `/registro?redirect=${encodeURIComponent(redirectTo)}`
      : "/registro";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isValid = email.trim().length > 3 && password.length >= 8;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginRequest({
        email: email.trim(),
        password,
      });

      window.location.href = safeInternalRedirect(redirectTo);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl rounded-3xl border border-warm-gray/10 bg-white/90 px-6 py-8 shadow-[0_12px_28px_rgba(48,43,41,0.08)] md:px-10 md:py-12">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-warm-gray">
          Iniciar sesión
        </h2>
        <p className="text-base text-warm-gray/70">
          Accede con tu correo y contraseña para entrar a LOOKHOME.
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Correo electrónico
          </span>
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-warm-gray/20 bg-white px-4 py-3 transition focus-within:border-terracotta-strong focus-within:ring-2 focus-within:ring-terracotta-strong/15">
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="nombre@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Contraseña
          </span>
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-warm-gray/20 bg-white px-4 py-3 transition focus-within:border-terracotta-strong focus-within:ring-2 focus-within:ring-terracotta-strong/15">
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-warm-gray/70">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-5 w-5 rounded-md border border-warm-gray/25 accent-terracotta-strong focus:outline-none focus:ring-2 focus:ring-terracotta-strong"
            />
            <span className="font-semibold text-warm-gray">Recordarme</span>
          </label>

          <span>Recuperación de contraseña próximamente.</span>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || loading}
          className="min-h-12 w-full rounded-xl bg-terracotta px-6 py-3 text-base font-semibold text-white transition duration-200 hover:bg-terracotta-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Ingresando..." : "Acceder"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-warm-gray/70">
        ¿Aún no tienes cuenta?{" "}
        <a
          href={registerHref}
          className="font-semibold text-terracotta-strong transition hover:text-warm-gray"
        >
          Crea una ahora
        </a>
      </p>
    </div>
  );
}
