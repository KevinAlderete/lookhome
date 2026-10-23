import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { LogoutDto } from "./dto/logout.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  register(@Body() body: RegisterDto, @Req() req: Request, @Ip() ip: string) {
    return this.authService.register({
      ...body,
      userAgent: req.headers["user-agent"],
      ip,
    } as any);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("login")
  login(@Body() body: LoginDto, @Req() req: Request, @Ip() ip: string) {
    return this.authService.login({
      ...body,
      userAgent: req.headers["user-agent"],
      ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("refresh")
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken, body.deviceId);
  }

  @Post("logout")
  logout(@CurrentUser() user: any, @Body() body: LogoutDto) {
    return this.authService.logout(user.id, body.refreshToken);
  }

  @SkipThrottle()
  @Get("me")
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id, user.sessionId);
  }
  @Public()
  @Get("health")
  async health() {
    return {
      ok: true,
      module: "auth",
    };
  }

  @Post("logout-all")
  logoutAll(@CurrentUser() user: any) {
    return this.authService.revokeAllUserSessions(user.id);
  }

  @Get("sessions")
  sessions(@CurrentUser() user: any) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete("sessions/:sessionId")
  revokeSession(
    @CurrentUser() user: any,
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
  ) {
    return this.authService.revokeSession(user.id, sessionId, user.sessionId);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @Post("forgot-password")
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }
  @Public()
  @Post("reset-password")
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @Post("request-email-verification")
  requestEmailVerification(@CurrentUser() user: any) {
    return this.authService.requestEmailVerification(user.id);
  }

  @Public()
  @Post("verify-email")
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }
}
