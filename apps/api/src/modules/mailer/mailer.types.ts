export type MailAddress = string | string[];

export type SendMailOptions = {
  to: MailAddress;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type SendVerifyEmailInput = {
  to: string;
  token: string;
  displayName?: string | null;
};

export type SendResetPasswordInput = {
  to: string;
  token: string;
  displayName?: string | null;
};
