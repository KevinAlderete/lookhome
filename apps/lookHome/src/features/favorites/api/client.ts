type ToggleFavoriteParams = {
  roomId: string;
  shouldFavorite: boolean;
};

export async function toggleFavoriteRequest({
  roomId,
  shouldFavorite,
}: ToggleFavoriteParams): Promise<void> {
  const response = await fetch("/api/favorites", {
    method: shouldFavorite ? "POST" : "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ roomId }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo actualizar favoritos.");
  }
}
