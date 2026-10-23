import { useState } from "react";
import { toggleFavoriteRequest } from "@/features/favorites/api/client";

type FavoriteButtonProps = {
  roomId: string;
  initialIsFavorite?: boolean;
  isAuthenticated?: boolean;
  loginUrl?: string;
  size?: "sm" | "md";
  accessibilityContext?: string;
  showError?: boolean;
};

export default function FavoriteButton({
  roomId,
  initialIsFavorite = false,
  isAuthenticated = false,
  loginUrl = "/login",
  size = "md",
  accessibilityContext,
  showError = true,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sizeClasses = "h-11 w-11";
  const iconSizeClasses = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      const redirect = encodeURIComponent(
        window.location.pathname + window.location.search,
      );
      window.location.href = `${loginUrl}?redirect=${redirect}`;
      return;
    }

    if (loading) return;

    const nextValue = !isFavorite;
    setLoading(true);
    setError("");

    try {
      setIsFavorite(nextValue);

      await toggleFavoriteRequest({
        roomId,
        shouldFavorite: nextValue,
      });
    } catch {
      setIsFavorite(!nextValue);
      setError("No se pudo actualizar el favorito. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={`${isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}${accessibilityContext ? `: ${accessibilityContext}` : ""}`}
        aria-pressed={isFavorite}
        className={[
          "flex items-center justify-center rounded-full backdrop-blur transition",
          "border border-warm-gray/15 bg-white/90 shadow-[0_10px_24px_rgba(0,0,0,0.14)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong",
          "disabled:cursor-not-allowed disabled:opacity-70",
          sizeClasses,
        ].join(" ")}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className={`${iconSizeClasses} ${isFavorite ? "text-terracotta-strong" : "text-warm-gray"}`}
          fill={isFavorite ? "currentColor" : "transparent"}
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z" />
        </svg>
      </button>
      {error && (
        <span
          role="alert"
          aria-live="assertive"
          className={
            showError
              ? "absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-800 shadow-lg"
              : "sr-only"
          }
        >
          {error}
        </span>
      )}
    </div>
  );
}
