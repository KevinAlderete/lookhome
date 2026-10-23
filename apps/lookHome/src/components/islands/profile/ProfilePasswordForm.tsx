import { useState } from "react";
import { updatePasswordRequest } from "@/features/profile/api/client";

export default function ProfilePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setMessage(null);

    if (newPassword !== confirmation) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("La nueva contraseña debe tener entre 8 y 128 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const result = await updatePasswordRequest({
        currentPassword,
        newPassword,
      });
      setMessage(
        result.message ||
          "La contraseña cambió y se cerraron las sesiones. Inicia sesión nuevamente.",
      );
      window.setTimeout(() => window.location.assign("/login"), 1200);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos cambiar la contraseña. Inténtalo nuevamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.07)] sm:p-7"
      aria-labelledby="profile-password-title"
    >
      <div>
        <p className="text-sm font-semibold text-terracotta-strong">Seguridad</p>
        <h2 id="profile-password-title" className="mt-1 text-2xl font-bold">
          Cambiar contraseña
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray/70">
          Por seguridad, el cambio cerrará las demás sesiones y te pedirá iniciar
          sesión con la nueva contraseña.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold text-warm-gray">
          Contraseña actual
          <input
            type={showPasswords ? "text" : "password"}
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-warm-gray">
            Nueva contraseña
            <input
              type={showPasswords ? "text" : "password"}
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            />
          </label>
          <label className="block text-sm font-semibold text-warm-gray">
            Confirma la nueva contraseña
            <input
              type={showPasswords ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            />
          </label>
        </div>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-warm-gray/75">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.currentTarget.checked)}
            className="h-4 w-4 accent-terracotta-strong"
          />
          Mostrar contraseñas
        </label>

        {message && (
          <p
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-5 text-sm font-semibold text-white transition hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-65"
        >
          {saving ? "Actualizando…" : "Cambiar contraseña"}
        </button>
      </form>
    </section>
  );
}
