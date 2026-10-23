import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import {
  SendMailOptions,
  SendResetPasswordInput,
  SendVerifyEmailInput,
} from "../mailer.types";
import { MailProvider } from "./mail.provider";
import { renderVerifyEmailTemplate } from "../templates/verify-email.template";
import { renderResetPasswordTemplate } from "../templates/reset-password.template";

@Injectable()
export class ResendMailProvider implements MailProvider {
  private readonly logger = new Logger(ResendMailProvider.name);
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

  async send(options: SendMailOptions): Promise<{ id?: string | null }> {
    const { data, error } = await this.resend.emails.send({
      from: this.mailFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      tags: options.tags,
    });

    if (error) {
      this.logger.error(`Resend error: ${JSON.stringify(error)}`);
      throw new InternalServerErrorException("No se pudo enviar el correo.");
    }

    return { id: data?.id ?? null };
  }

  async sendVerifyEmail(
    input: SendVerifyEmailInput,
  ): Promise<{ id?: string | null }> {
    const tpl = renderVerifyEmailTemplate({
      appUrl: this.appUrl,
      token: input.token,
      displayName: input.displayName,
    });

    return this.send({
      to: input.to,
      subject: tpl.subject,
      html: tpl.html,
      tags: [{ name: "type", value: "verify-email" }],
    });
  }

  async sendResetPassword(
    input: SendResetPasswordInput,
  ): Promise<{ id?: string | null }> {
    const tpl = renderResetPasswordTemplate({
      appUrl: this.appUrl,
      token: input.token,
      displayName: input.displayName,
    });

    return this.send({
      to: input.to,
      subject: tpl.subject,
      html: tpl.html,
      tags: [{ name: "type", value: "reset-password" }],
    });
  }
}
