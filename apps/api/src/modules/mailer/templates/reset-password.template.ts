import { renderBaseEmailTemplate } from "./base-email.template";

export function renderResetPasswordTemplate(args: {
  appUrl: string;
  token: string;
  displayName?: string | null;
}): { subject: string; html: string } {
  const resetUrl = `${args.appUrl}/reset-password?token=${encodeURIComponent(args.token)}`;
  const displayName = args.displayName?.trim() || "usuario";

  const subject = "Restablece tu contraseña en LOOKHOME";
  const html = renderBaseEmailTemplate({
    preheader: "Recibimos una solicitud para restablecer tu contraseña.",
    title: "Restablecimiento de contraseña",
    intro: `Hola ${displayName}, haz clic en el botón para crear una nueva contraseña para tu cuenta de LOOKHOME.`,
    buttonLabel: "Restablecer contraseña",
    buttonUrl: resetUrl,
    secondaryText:
      "Si no solicitaste este cambio, ignora este mensaje. Tu contraseña actual seguirá siendo válida.",
    footerText:
      "Por seguridad, este enlace debe usarse solo para restablecer el acceso a tu cuenta LOOKHOME.",
  });

  return { subject, html };
}
