import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../../database/prisma/prisma.service";
import { RESOURCE_OWNER_KEY } from "../decorators/resource-owner.decorator";

@Injectable()
export class RoomOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<string>(
      RESOURCE_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (resource !== "room") {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const roomId = req.params.id || req.params.roomId || req.body.roomId;

    if (!roomId) {
      throw new ForbiddenException("No se pudo resolver el room.");
    }

    if (user.roles.includes("admin")) {
      return true;
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        listing: {
          select: {
            hostUserId: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room no encontrado.");
    }

    if (room.listing.hostUserId !== user.id) {
      throw new ForbiddenException("No eres propietario de este room.");
    }

    return true;
  }
}
