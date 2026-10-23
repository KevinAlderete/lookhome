import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../../database/prisma/prisma.service";
import {
  OWNERSHIP_KEY,
  OwnershipResource,
} from "../decorators/ownership.decorator";

function isUuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<OwnershipResource>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resource) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const id =
      req.params.id ||
      req.params.listingId ||
      req.params.roomId ||
      req.params.bookingId ||
      req.params.conversationId ||
      req.body.listingId ||
      req.body.roomId ||
      req.body.bookingId ||
      req.body.conversationId;

    if (!id) {
      throw new ForbiddenException("No se pudo resolver el recurso.");
    }

    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];

    if (roles.includes("admin") || roles.includes("support")) {
      return true;
    }

    switch (resource) {
      case "listing": {
        const listing = await this.prisma.listing.findUnique({
          where: { id },
          select: { id: true, hostUserId: true },
        });
        if (!listing) throw new NotFoundException("Listing no encontrado.");
        if (listing.hostUserId !== user.id) {
          throw new ForbiddenException("No eres propietario de este listing.");
        }
        return true;
      }

      case "room": {
        const room = await this.prisma.room.findUnique({
          where: { id },
          select: {
            id: true,
            listing: { select: { hostUserId: true } },
          },
        });
        if (!room) throw new NotFoundException("Room no encontrado.");
        if (room.listing.hostUserId !== user.id) {
          throw new ForbiddenException("No eres propietario de este room.");
        }
        return true;
      }

      case "booking-host": {
        const booking = await this.prisma.booking.findUnique({
          where: { id },
          select: { id: true, hostUserId: true },
        });
        if (!booking) throw new NotFoundException("Booking no encontrado.");
        if (booking.hostUserId !== user.id) {
          throw new ForbiddenException("No eres host de este booking.");
        }
        return true;
      }

      case "booking-tenant": {
        const booking = await this.prisma.booking.findUnique({
          where: { id },
          select: { id: true, tenantUserId: true },
        });
        if (!booking) throw new NotFoundException("Booking no encontrado.");
        if (booking.tenantUserId !== user.id) {
          throw new ForbiddenException("No eres tenant de este booking.");
        }
        return true;
      }

      case "conversation-participant": {
        if (!isUuidV4(id)) {
          throw new NotFoundException("Conversación no encontrada.");
        }
        const participant =
          await this.prisma.conversationParticipant.findUnique({
            where: {
              conversationId_userId: {
                conversationId: id,
                userId: user.id,
              },
            },
            select: { conversationId: true },
          });
        if (!participant) {
          throw new NotFoundException("Conversación no encontrada.");
        }
        return true;
      }

      case "availability-rule": {
        const rule = await this.prisma.availabilityRule.findUnique({
          where: { id },
          select: {
            room: { select: { listing: { select: { hostUserId: true } } } },
          },
        });
        if (!rule)
          throw new NotFoundException("Regla de disponibilidad no encontrada.");
        if (rule.room.listing.hostUserId !== user.id) {
          throw new ForbiddenException("No eres propietario de esta regla.");
        }
        return true;
      }

      case "calendar-block": {
        const block = await this.prisma.calendarBlock.findUnique({
          where: { id },
          select: {
            room: { select: { listing: { select: { hostUserId: true } } } },
          },
        });
        if (!block)
          throw new NotFoundException("Bloque de calendario no encontrado.");
        if (block.room.listing.hostUserId !== user.id) {
          throw new ForbiddenException("No eres propietario de este bloque.");
        }
        return true;
      }

      default:
        return true;
    }
  }
}
