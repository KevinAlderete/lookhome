import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { PrismaService } from "../../database/prisma/prisma.service";
import type { StringValue } from "ms";
import { MailerService } from "../mailer/mailer.service";
import { CURRENT_SESSION_TOKEN_VERSION } from "./auth-constants";

type JwtPayload = {
  sub: string;
  sid?: string;
  did?: string | null;
  ver?: number;
  typ: "access" | "refresh";
};

type RegisterInput = {
  email?: string;
  phoneE164?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  deviceId?: string;
};

type LoginInput = {
  email?: string;
  phoneE164?: string;
  password: string;
  userAgent?: string;
  ip?: string;
  deviceId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  // --- Registro ---
  async register(input: RegisterInput) {
    const email = input.email?.trim().toLowerCase() || null;
    const phoneE164 = input.phoneE164?.trim() || null;
    const deviceId =
      input.deviceId?.trim() || `web-${randomBytes(8).toString("hex")}`;

    if (!email && !phoneE164) {
      throw new BadRequestException(
        "Debes enviar email o phoneE164 para registrarte.",
      );
    }

    if (!input.password || input.password.length < 8) {
      throw new BadRequestException(
        "La contraseña debe tener al menos 8 caracteres.",
      );
    }

    // Validaciones de existencia
    if (email) {
      const exists = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (exists) throw new BadRequestException("El email ya está registrado.");
    }
    if (phoneE164) {
      const exists = await this.prisma.user.findUnique({
        where: { phoneE164 },
        select: { id: true },
      });
      if (exists)
        throw new BadRequestException("El teléfono ya está registrado.");
    }

    const passwordHash = this.hashSecret(input.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        phoneE164,
        passwordHash,
        status: "active",
        roles: { create: [{ role: "tenant" }] },
        profile: {
          create: {
            firstName: input.firstName?.trim() || null,
            lastName: input.lastName?.trim() || null,
            displayName:
              input.displayName?.trim() ||
              [input.firstName, input.lastName].filter(Boolean).join(" ") ||
              null,
          },
        },
      },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            photoUrl: true,
          },
        },
        roles: true,
      },
    });

    // Crear sesión inicial
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: "__PENDING__",
        expiresAt: this.buildRefreshExpiryDate(),
        deviceId,
        tokenVersion: CURRENT_SESSION_TOKEN_VERSION,
        lastUsedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      sessionId: session.id,
      deviceId,
    });

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.hashSecret(tokens.refreshToken) },
    });

    return {
      message: "Usuario registrado correctamente.",
      user: this.serializeUser(user),
      tokens,
    };
  }

  // --- Login ---
  async login(input: LoginInput) {
    const email = input.email?.trim().toLowerCase() || undefined;
    const phoneE164 = input.phoneE164?.trim() || undefined;
    const deviceId =
      input.deviceId?.trim() || `web-${randomBytes(8).toString("hex")}`;

    if (!email && !phoneE164)
      throw new BadRequestException("Debes enviar email o phoneE164.");

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneE164 ? [{ phoneE164 }] : []),
        ],
      },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            photoUrl: true,
          },
        },
        roles: true,
      },
    });

    if (!user || !user.passwordHash)
      throw new UnauthorizedException("Credenciales inválidas.");

    const isValid = this.verifySecret(input.password, user.passwordHash);
    if (!isValid || user.status !== "active")
      throw new UnauthorizedException("Credenciales inválidas.");

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: "__PENDING__",
        userAgent: input.userAgent || null,
        ip: input.ip || null,
        expiresAt: this.buildRefreshExpiryDate(),
        deviceId,
        tokenVersion: CURRENT_SESSION_TOKEN_VERSION,
        lastUsedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      sessionId: session.id,
      deviceId,
    });

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.hashSecret(tokens.refreshToken) },
    });

    return {
      message: "Login correcto.",
      user: this.serializeUser(user),
      tokens,
    };
  }

  // --- Refresh con Rotación Estricta ---
  async refresh(refreshToken: string, deviceId?: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (
      payload.typ !== "refresh" ||
      !payload.sid ||
      payload.ver !== CURRENT_SESSION_TOKEN_VERSION
    ) {
      throw new UnauthorizedException(
        "La sesión requiere un nuevo inicio de sesión.",
      );
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          include: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
                photoUrl: true,
              },
            },
            roles: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.tokenVersion !== CURRENT_SESSION_TOKEN_VERSION
    )
      throw new UnauthorizedException("Sesión inválida.");
    if (session.expiresAt <= new Date())
      throw new UnauthorizedException("La sesión expiró.");
    if (session.user.status !== "active")
      throw new UnauthorizedException("Usuario inactivo.");

    if (deviceId && session.deviceId && deviceId !== session.deviceId) {
      throw new UnauthorizedException("El dispositivo no coincide.");
    }

    const validStoredToken = this.verifySecret(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!validStoredToken) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        "Refresh token reutilizado o comprometido.",
      );
    }

    const newSession = await this.prisma.userSession.create({
      data: {
        userId: session.userId,
        refreshTokenHash: "__PENDING__",
        userAgent: session.userAgent,
        ip: session.ip,
        expiresAt: this.buildRefreshExpiryDate(),
        deviceId: session.deviceId,
        tokenVersion: CURRENT_SESSION_TOKEN_VERSION,
        lastUsedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens({
      userId: session.user.id,
      sessionId: newSession.id,
      deviceId: session.deviceId ?? undefined,
    });

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          replacedBySessionId: newSession.id,
          lastUsedAt: new Date(),
        },
      }),
      this.prisma.userSession.update({
        where: { id: newSession.id },
        data: { refreshTokenHash: this.hashSecret(tokens.refreshToken) },
      }),
    ]);

    return {
      message: "Tokens renovados correctamente.",
      user: this.serializeUser(session.user),
      tokens,
    };
  }

  // --- Logout ---
  async logout(userId: string, refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload.sid || payload.sub !== userId)
      throw new UnauthorizedException("Token inválido.");

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        revokedAt: true,
      },
    });

    if (!session || session.userId !== userId || session.revokedAt)
      throw new UnauthorizedException("Sesión inválida.");

    if (!this.verifySecret(refreshToken, session.refreshTokenHash)) {
      throw new UnauthorizedException("Refresh token inválido.");
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return { message: "Logout correcto." };
  }

  // --- Password Recovery ---
  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        profile: { select: { displayName: true } },
      },
    });

    if (!user) {
      return {
        message: "Si el email existe, se enviará un enlace de recuperación.",
      };
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = this.hashSecret(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.mailerService.sendResetPassword({
      to: user.email!,
      token,
      displayName: user.profile?.displayName ?? null,
    });

    return {
      message: "Si el email existe, se enviará un enlace de recuperación.",
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const candidates = await this.prisma.passwordResetToken.findMany({
      where: { consumedAt: null, expiresAt: { gt: new Date() } },
    });

    const match = candidates.find((x) => this.verifySecret(token, x.tokenHash));
    if (!match) throw new BadRequestException("Token inválido o expirado.");

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: match.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: match.userId },
        data: { passwordHash: this.hashSecret(newPassword) },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: match.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: "Contraseña actualizada correctamente." };
  }

  // --- Helpers ---
  async revokeAllUserSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: "Todas las sesiones fueron revocadas." };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId?: string,
  ) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, revokedAt: true },
    });
    if (!session) throw new NotFoundException("Sesión no encontrada.");

    if (!session.revokedAt) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return {
      message: session.revokedAt
        ? "La sesión ya estaba cerrada."
        : "La sesión fue cerrada.",
      currentSession: sessionId === currentSessionId,
    };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        tokenVersion: true,
      },
    });

    const now = new Date();
    return sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      revokedAt: session.revokedAt,
      isCurrent: session.id === currentSessionId,
      status: session.revokedAt
        ? "revoked"
        : session.expiresAt <= now
          ? "expired"
          : session.tokenVersion !== CURRENT_SESSION_TOKEN_VERSION
            ? "reauthentication_required"
            : "active",
    }));
  }

  async me(userId: string, sessionId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            photoUrl: true,
          },
        },
        roles: true,
      },
    });
    if (!user) throw new UnauthorizedException("Usuario no encontrado.");
    return {
      ...this.serializeUser(user),
      ...(sessionId ? { sessionId } : {}),
    };
  }

  private async issueTokens(args: {
    userId: string;
    sessionId: string;
    deviceId?: string;
  }) {
    const accessSecret = this.configService.get<string>("JWT_ACCESS_SECRET");
    const refreshSecret = this.configService.get<string>("JWT_REFRESH_SECRET");
    const accessExpiresIn = (this.configService.get<string>(
      "JWT_ACCESS_EXPIRES_IN",
    ) ?? "15m") as StringValue;
    const refreshExpiresIn = (this.configService.get<string>(
      "JWT_REFRESH_EXPIRES_IN",
    ) ?? "30d") as StringValue;

    if (!accessSecret || !refreshSecret)
      throw new Error("JWT secrets no configurados.");

    const basePayload = {
      sub: args.userId,
      ver: CURRENT_SESSION_TOKEN_VERSION,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          ...basePayload,
          sid: args.sessionId,
          did: args.deviceId ?? null,
          typ: "access",
        },
        { secret: accessSecret, expiresIn: accessExpiresIn },
      ),
      this.jwtService.signAsync(
        {
          ...basePayload,
          sid: args.sessionId,
          did: args.deviceId ?? null,
          typ: "refresh",
        },
        { secret: refreshSecret, expiresIn: refreshExpiresIn },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: accessExpiresIn,
    };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>("JWT_REFRESH_SECRET");
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException("Refresh token inválido o expirado.");
    }
  }

  private buildRefreshExpiryDate(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }

  private serializeUser(user: any) {
    const displayName =
      user.profile?.displayName?.trim() ||
      [user.profile?.firstName, user.profile?.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Mi cuenta";
    const photoUrl = user.profile?.photoUrl ?? null;

    return {
      id: user.id,
      email: user.email,
      phoneE164: user.phoneE164,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      name: displayName,
      image: photoUrl,
      profile: { displayName, photoUrl },
      roles: user.roles.map((x: any) =>
        typeof x.role === "string"
          ? x.role
          : (x.role?.name ?? x.role?.code ?? x.role?.slug ?? x.role?.id),
      ),
    };
  }

  private hashSecret(secret: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(secret, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  private verifySecret(secret: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    const hashBuffer = scryptSync(secret, salt, 64);
    const originalBuffer = Buffer.from(originalHash, "hex");
    return (
      hashBuffer.length === originalBuffer.length &&
      timingSafeEqual(hashBuffer, originalBuffer)
    );
  }

  async requestEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: { select: { displayName: true } },
      },
    });

    if (!user?.email) {
      throw new BadRequestException("El usuario no tiene email.");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = this.hashSecret(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt,
      },
    });

    await this.mailerService.sendVerifyEmail({
      to: user.email,
      token,
      displayName: user.profile?.displayName ?? null,
    });

    return {
      message: "Correo de verificación enviado correctamente.",
    };
  }

  async verifyEmail(token: string) {
    const candidates = await this.prisma.emailVerificationToken.findMany({
      where: {
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    const match = candidates.find((x) => this.verifySecret(token, x.tokenHash));

    if (!match) {
      throw new BadRequestException("Token inválido o expirado.");
    }

    const existingEmailVerification =
      await this.prisma.userVerification.findFirst({
        where: {
          userId: match.userId,
          type: "email",
          status: "verified",
        },
        select: { id: true },
      });

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: match.id },
        data: {
          consumedAt: new Date(),
        },
      });

      if (existingEmailVerification) {
        await tx.userVerification.update({
          where: { id: existingEmailVerification.id },
          data: {
            verifiedAt: new Date(),
            metadata: { email: match.email },
          },
        });
      } else {
        await tx.userVerification.create({
          data: {
            userId: match.userId,
            type: "email",
            status: "verified",
            verifiedAt: new Date(),
            metadata: { email: match.email },
          },
        });
      }
    });

    return {
      message: "Email verificado correctamente.",
    };
  }
}
