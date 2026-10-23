import { renderBaseEmailTemplate } from "./base-email.template";

export function renderVerifyEmailTemplate(args: {
  appUrl: string;
  token: string;
  displayName?: string | null;
}): { subject: string; html: string } {
  const verifyUrl = `${args.appUrl}/verify-email?token=${encodeURIComponent(args.token)}`;
  const displayName = args.displayName?.trim() || "usuario";

  const subject = "Verifica tu correo en LOOKHOME";
  const html = renderBaseEmailTemplate({
    preheader: "Verifica tu correo para activar tu cuenta en LOOKHOME.",
    title: "Verifica tu correo",
    intro: `Hola ${displayName}, confirma tu dirección de correo para seguir usando LOOKHOME de forma segura.`,
    buttonLabel: "Verificar correo",
    buttonUrl: verifyUrl,
    secondaryText:
      "Si no solicitaste esta acción, puedes ignorar este mensaje sin problema.",
    footerText:
      "Este enlace de verificación fue enviado por LOOKHOME. Si no reconoces esta actividad, no compartas este correo.",
  });

  return { subject, html };
}
