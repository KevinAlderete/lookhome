import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma/prisma.service";
import { CURRENT_SESSION_TOKEN_VERSION } from "../auth-constants";

type JwtPayload = {
  sub: string;
  sid?: string;
  typ?: "access" | "refresh";
  ver?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>("JWT_ACCESS_SECRET");

    if (!secret) {
      throw new Error("JWT_ACCESS_SECRET no está configurado.");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (
      payload.typ !== "access" ||
      !payload.sid ||
      payload.ver !== CURRENT_SESSION_TOKEN_VERSION
    ) {
      throw new UnauthorizedException("Inicia sesión nuevamente.");
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        tokenVersion: CURRENT_SESSION_TOKEN_VERSION,
        user: { status: "active" },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            status: true,
            roles: { select: { role: true } },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException("La sesión ya no está activa.");
    }

    return {
      id: session.user.id,
      status: session.user.status,
      roles: session.user.roles.map((x) => x.role),
      sessionId: session.id,
    };
  }
}
