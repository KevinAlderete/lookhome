export type RegisterDto = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export async function registerRequest(payload: RegisterDto) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo crear la cuenta.");
  }

  return data;
}
