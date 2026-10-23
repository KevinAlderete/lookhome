import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = any>(
    err: any,
    user: TUser | false,
    _info: any,
    context: ExecutionContext,
  ): TUser | undefined {
    const authorization = context.switchToHttp().getRequest()
      .headers?.authorization;
    const hasBearerToken =
      typeof authorization === "string" &&
      /^Bearer\b/i.test(authorization.trim());

    if (err || (hasBearerToken && !user)) {
      throw err || new UnauthorizedException("Token inválido.");
    }

    return user || undefined;
  }
}
