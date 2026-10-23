type BaseEmailTemplateArgs = {
  preheader: string;
  title: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  secondaryText?: string;
  footerText?: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export function renderBaseEmailTemplate(args: BaseEmailTemplateArgs): string {
  const preheader = escapeHtml(args.preheader);
  const title = escapeHtml(args.title);
  const intro = escapeHtml(args.intro);
  const buttonLabel = escapeHtml(args.buttonLabel);
  const buttonUrl = args.buttonUrl;
  const secondaryText = args.secondaryText
    ? escapeHtml(args.secondaryText)
    : null;
  const footerText = args.footerText ? escapeHtml(args.footerText) : "LOOKHOME";

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${preheader}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:24px 32px;">
                <div style="font-size:20px;font-weight:700;color:#ffffff;">LOOKHOME</div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;font-size:28px;line-height:1.2;color:#111827;">${title}</h1>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#374151;">${intro}</p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="border-radius:10px;background:#111827;">
                      <a href="${buttonUrl}"
                         style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                        ${buttonLabel}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#6b7280;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>

                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;word-break:break-all;">
                  <a href="${buttonUrl}" style="color:#2563eb;text-decoration:none;">${buttonUrl}</a>
                </p>

                ${
                  secondaryText
                    ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">${secondaryText}</p>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                  ${footerText}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
