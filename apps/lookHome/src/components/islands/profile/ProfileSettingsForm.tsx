import { useState } from "react";
import {
  updateProfileRequest,
  uploadAvatarRequest,
} from "@/features/profile/api/client";
import { dispatchPublicProfileUpdate } from "@/features/profile/events";
import type { ProfileUser } from "@/features/profile/types";

type Props = {
  initialProfile: ProfileUser["profile"];
  publicProfileHref?: string | null;
};

const MAX_AVATAR_SIZE = 8 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ProfileSettingsForm({
  initialProfile,
  publicProfileHref,
}: Props) {
  const [firstName, setFirstName] = useState(initialProfile?.firstName ?? "");
  const [lastName, setLastName] = useState(initialProfile?.lastName ?? "");
  const [displayName, setDisplayName] = useState(
    initialProfile?.displayName ?? "",
  );
  const [locale, setLocale] = useState(initialProfile?.locale ?? "es-PE");
  const [timezone, setTimezone] = useState(
    initialProfile?.timezone ?? "America/Lima",
  );
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.photoUrl ?? null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    setMessage(null);
    setError(null);
    try {
      await updateProfileRequest({
        firstName,
        lastName,
        displayName,
        locale: "es-PE",
        timezone: "America/Lima",
      });
      dispatchPublicProfileUpdate({
        displayName:
          displayName.trim() ||
          [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") ||
          "Mi cuenta",
        photoUrl,
      });
      setMessage("Tus datos se guardaron correctamente.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos guardar tus datos. Inténtalo nuevamente.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePhotoChange = (file: File | null) => {
    setError(null);
    setMessage(null);
    if (!file) {
      setSelectedPhoto(null);
      return;
    }
    if (!AVATAR_TYPES.has(file.type)) {
      setSelectedPhoto(null);
      setError("Elige una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_AVATAR_SIZE) {
      setSelectedPhoto(null);
      setError("La imagen debe pesar 8 MB o menos.");
      return;
    }
    setSelectedPhoto(file);
  };

  const handlePhotoUpload = async () => {
    if (!selectedPhoto || savingPhoto) return;

    setSavingPhoto(true);
    setMessage(null);
    setError(null);
    try {
      const result = await uploadAvatarRequest(
        selectedPhoto,
        crypto.randomUUID(),
      );
      setPhotoUrl(result.photoUrl ?? null);
      setSelectedPhoto(null);
      dispatchPublicProfileUpdate({
        displayName:
          displayName.trim() ||
          [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") ||
          "Mi cuenta",
        photoUrl: result.photoUrl ?? null,
      });
      setMessage("Tu foto pública se actualizó correctamente.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos actualizar la foto. Inténtalo nuevamente.",
      );
    } finally {
      setSavingPhoto(false);
    }
  };

  return (
    <section
      id="perfil-y-preferencias"
      className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.07)] sm:p-7"
      aria-labelledby="profile-public-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-terracotta-strong">
            Perfil de cuenta
          </p>
          <h2 id="profile-public-title" className="mt-1 text-2xl font-bold">
            Perfil y preferencias
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray/70">
            Mantén actualizados tu identidad pública, tus datos personales y tus
            preferencias regionales.
          </p>
        </div>
        {publicProfileHref && (
          <a
            href={publicProfileHref}
            className="inline-flex min-h-11 items-center rounded-xl border border-warm-gray/20 px-4 text-sm font-semibold text-warm-gray transition hover:border-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            Ver perfil público
          </a>
        )}
      </div>

      <form onSubmit={handleProfileSubmit} className="mt-6 space-y-6">
      <div className="border-b border-warm-gray/10 pb-5">
        <h3 className="text-lg font-bold text-warm-gray">Perfil público</h3>
        <p className="mt-1 text-xs leading-5 text-warm-gray/65">
          El nombre visible y la foto aparecen junto a tus anuncios. No mostramos
          aquí tu correo ni tu teléfono.
        </p>
      </div>
      <div className="flex flex-col gap-5 border-b border-warm-gray/10 pb-6 sm:flex-row sm:items-center">
        <img
          src={photoUrl || "/avatar-placeholder.png"}
          alt=""
          width="96"
          height="96"
          className="h-24 w-24 rounded-full border-4 border-cream object-cover"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor="profile-avatar"
            className="block text-sm font-semibold text-warm-gray"
          >
            Foto de perfil
          </label>
          <p className="mt-1 text-xs leading-5 text-warm-gray/65">
            Usa una imagen JPG, PNG o WebP de hasta 8 MB.
          </p>
          <input
            id="profile-avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) =>
              handlePhotoChange(event.currentTarget.files?.[0] ?? null)
            }
            className="mt-3 block min-h-11 w-full max-w-xl rounded-xl border border-warm-gray/15 bg-cream px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:font-semibold file:text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          />
          {selectedPhoto && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="max-w-full truncate text-xs text-warm-gray/70">
                {selectedPhoto.name}
              </span>
              <button
                type="button"
                onClick={handlePhotoUpload}
                disabled={savingPhoto}
                className="inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-4 text-sm font-semibold text-white transition hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-65"
              >
                {savingPhoto ? "Subiendo…" : "Actualizar foto"}
              </button>
            </div>
          )}
        </div>
      </div>

        <label className="block text-sm font-semibold text-warm-gray">
          Nombre que verán los huéspedes
          <input
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            autoComplete="nickname"
            maxLength={80}
            className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none transition focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
          />
        </label>

        <div className="border-b border-warm-gray/10 pb-5">
          <h3 className="text-lg font-bold text-warm-gray">Datos personales y preferencias</h3>
          <p className="mt-1 text-xs leading-5 text-warm-gray/65">
            Tus nombres personales no aparecen en el perfil público.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-warm-gray">
            Nombre
            <input
              name="firstName"
              value={firstName}
              onChange={(event) => setFirstName(event.currentTarget.value)}
              autoComplete="given-name"
              maxLength={80}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none transition focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            />
          </label>
          <label className="text-sm font-semibold text-warm-gray">
            Apellido
            <input
              name="lastName"
              value={lastName}
              onChange={(event) => setLastName(event.currentTarget.value)}
              autoComplete="family-name"
              maxLength={80}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none transition focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            />
          </label>
          <label className="text-sm font-semibold text-warm-gray">
            Idioma
            <select
              name="locale"
              value={locale}
              onChange={(event) => setLocale(event.currentTarget.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            >
              <option value="es-PE">Español (Perú)</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-warm-gray">
            Zona horaria
            <select
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.currentTarget.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 font-normal outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
            >
              <option value="America/Lima">Lima (UTC−05:00)</option>
            </select>
          </label>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status" aria-live="polite">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-5 text-sm font-semibold text-white transition hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-65"
          >
            {savingProfile ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}
