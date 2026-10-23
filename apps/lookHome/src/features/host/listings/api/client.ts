export async function publishListingRequest(id: string) {
  const response = await fetch(`/api/host/listings/${encodeURIComponent(id)}/publish`, {
    method: "PATCH",
    credentials: "include",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo publicar el anuncio.");
  }

  return data;
}
