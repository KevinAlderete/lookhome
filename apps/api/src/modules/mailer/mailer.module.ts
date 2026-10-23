import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MailerService } from "./mailer.service";
import { ResendMailProvider } from "./providers/resend-mail.provider";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ResendMailProvider, MailerService],
  exports: [MailerService],
})
export class MailerModule {}
