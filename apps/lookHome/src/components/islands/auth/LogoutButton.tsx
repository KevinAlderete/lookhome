import { useState } from "react";
import { logoutRequest } from "@/features/auth/api/client";

type LogoutButtonProps = {
  redirectTo?: string;
  className?: string;
  label?: string;
};

export default function LogoutButton({
  redirectTo = "/",
  className = "",
  label = "Cerrar sesión",
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await logoutRequest();
      window.location.href = redirectTo;
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className}
    >
      {loading ? "Saliendo..." : label}
    </button>
  );
}
