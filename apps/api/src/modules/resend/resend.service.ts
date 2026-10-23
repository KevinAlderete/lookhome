import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly resend: Resend;
  private readonly mailFrom: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("RESEND_API_KEY");
    const mailFrom = this.configService.get<string>("MAIL_FROM");
    const appUrl = this.configService.get<string>("APP_URL");

    if (!apiKey) {
      throw new Error("RESEND_API_KEY no está configurado.");
    }

    if (!mailFrom) {
      throw new Error("MAIL_FROM no está configurado.");
    }

    if (!appUrl) {
      throw new Error("APP_URL no está configurado.");
    }

    this.resend = new Resend(apiKey);
    this.mailFrom = mailFrom;
    this.appUrl = appUrl;
  }

  async sendEmailVerificationEmail(args: {
    to: string;
    token: string;
    displayName?: string | null;
  }) {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(args.token)}`;
    const name = args.displayName || "usuario";

    const { data, error } = await this.resend.emails.send({
      from: this.mailFrom,
      to: args.to,
      subject: "Verifica tu correo en LOOKHOME",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2>Verifica tu correo</h2>
          <p>Hola ${this.escapeHtml(name)},</p>
          <p>Haz clic en el siguiente botón para verificar tu correo en LOOKHOME:</p>
          <p style="margin:24px 0">
            <a href="${verifyUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">
              Verificar correo
            </a>
          </p>
          <p>Si no solicitaste esta acción, puedes ignorar este mensaje.</p>
          <p>Enlace directo:</p>
          <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(
        `Error enviando email de verificación: ${JSON.stringify(error)}`,
      );
      throw new InternalServerErrorException(
        "No se pudo enviar el correo de verificación.",
      );
    }

    return data;
  }

  async sendPasswordResetEmail(args: {
    to: string;
    token: string;
    displayName?: string | null;
  }) {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(args.token)}`;
    const name = args.displayName || "usuario";

    const { data, error } = await this.resend.emails.send({
      from: this.mailFrom,
      to: args.to,
      subject: "Restablece tu contraseña en LOOKHOME",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2>Restablecimiento de contraseña</h2>
          <p>Hola ${this.escapeHtml(name)},</p>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">
              Restablecer contraseña
            </a>
          </p>
          <p>Si no solicitaste este cambio, ignora este correo.</p>
          <p>Enlace directo:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(
        `Error enviando email de reset: ${JSON.stringify(error)}`,
      );
      throw new InternalServerErrorException(
        "No se pudo enviar el correo de recuperación.",
      );
    }

    return data;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
