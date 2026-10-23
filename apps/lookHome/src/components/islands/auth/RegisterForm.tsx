import { useMemo, useState } from "react";
import { z } from "zod";
import { registerRequest } from "@/features/auth/api/register";

const registerSchema = z
  .object({
    firstName: z.string().min(2, "Ingresa tu nombre."),
    lastName: z.string().min(2, "Ingresa tu apellido."),
    email: z.string().email("Ingresa un correo válido."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type RegisterFormProps = {
  redirectTo?: string;
};

export default function RegisterForm({ redirectTo = "/" }: RegisterFormProps) {
  const loginHref =
    redirectTo && redirectTo !== "/"
      ? `/login?redirect=${encodeURIComponent(redirectTo)}`
      : "/login";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formIsValid = useMemo(() => {
    return Boolean(
      accepted &&
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.trim() &&
      confirmPassword.trim(),
    );
  }, [accepted, firstName, lastName, email, password, confirmPassword]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const result = registerSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    });

    if (!accepted) {
      setError("Debes aceptar los términos y la política de privacidad.");
      return;
    }

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Revisa los campos.");
      return;
    }

    setLoading(true);

    try {
      await registerRequest({
        firstName,
        lastName,
        email,
        password,
      });

      setSuccess("Cuenta creada. Volviendo a donde estabas…");

      setTimeout(() => {
        window.location.href = redirectTo;
      }, 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear la cuenta.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl rounded-3xl border border-warm-gray/10 bg-white/90 px-6 py-8 shadow-[0_12px_28px_rgba(48,43,41,0.08)] md:px-10 md:py-12">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-warm-gray">Crear cuenta</h2>
        <p className="text-base text-warm-gray/70">
          Regístrate para guardar favoritos, conversar con anfitriones y
          publicar anuncios en LOOKHOME.
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Nombre completo
          </span>
          <div className="min-h-12 rounded-xl border border-warm-gray/20 bg-white px-4 py-3">
            <input
              type="text"
              name="given-name"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Apellido completo
          </span>
          <div className="min-h-12 rounded-xl border border-warm-gray/20 bg-white px-4 py-3">
            <input
              type="text"
              name="family-name"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Tu apellido"
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Correo electrónico
          </span>
          <div className="min-h-12 rounded-xl border border-warm-gray/20 bg-white px-4 py-3">
            <input
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Contraseña
          </span>
          <div className="min-h-12 rounded-xl border border-warm-gray/20 bg-white px-4 py-3">
            <input
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Confirmar contraseña
          </span>
          <div className="min-h-12 rounded-xl border border-warm-gray/20 bg-white px-4 py-3">
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite tu contraseña"
              className="w-full bg-transparent text-base text-warm-gray placeholder:text-warm-gray/50 outline-none"
            />
          </div>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-warm-gray/70">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded-md border border-warm-gray/25 accent-terracotta-strong"
          />
          <span>
            Acepto los{" "}
            <span className="font-semibold">
              términos y la política de privacidad
            </span>
            .
          </span>
        </label>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={!formIsValid || loading}
          className="min-h-12 w-full rounded-xl bg-terracotta px-6 py-3 text-base font-semibold text-white transition hover:bg-terracotta-strong disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-warm-gray/70">
        ¿Ya tienes cuenta?{" "}
        <a
          href={loginHref}
          className="font-semibold text-terracotta-strong transition hover:text-warm-gray"
        >
          Inicia sesión
        </a>
      </p>
    </div>
  );
}
