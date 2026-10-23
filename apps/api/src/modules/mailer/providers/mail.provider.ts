import {
  SendMailOptions,
  SendResetPasswordInput,
  SendVerifyEmailInput,
} from "../mailer.types";

export interface MailProvider {
  send(options: SendMailOptions): Promise<{ id?: string | null }>;
  sendVerifyEmail(input: SendVerifyEmailInput): Promise<{ id?: string | null }>;
  sendResetPassword(
    input: SendResetPasswordInput,
  ): Promise<{ id?: string | null }>;
}
