import { Injectable } from "@nestjs/common";
import {
  SendMailOptions,
  SendResetPasswordInput,
  SendVerifyEmailInput,
} from "./mailer.types";
import { ResendMailProvider } from "./providers/resend-mail.provider";

@Injectable()
export class MailerService {
  constructor(private readonly provider: ResendMailProvider) {}

  async send(options: SendMailOptions) {
    return this.provider.send(options);
  }

  async sendVerifyEmail(input: SendVerifyEmailInput) {
    return this.provider.sendVerifyEmail(input);
  }

  async sendResetPassword(input: SendResetPasswordInput) {
    return this.provider.sendResetPassword(input);
  }
}
