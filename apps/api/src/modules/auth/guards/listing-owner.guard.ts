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
export class ListingOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<string>(
      RESOURCE_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (resource !== "listing") {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const listingId =
      req.params.id || req.params.listingId || req.body.listingId;

    if (!listingId) {
      throw new ForbiddenException("No se pudo resolver el listing.");
    }

    if (user.roles.includes("admin")) {
      return true;
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, hostUserId: true },
    });

    if (!listing) {
      throw new NotFoundException("Listing no encontrado.");
    }

    if (listing.hostUserId !== user.id) {
      throw new ForbiddenException("No eres propietario de este listing.");
    }

    return true;
  }
}
