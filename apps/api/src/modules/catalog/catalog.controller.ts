import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";
import { Public } from "../auth/decorators/public.decorator";

@Public()
@Controller("catalog")
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("amenities")
  amenities() {
    return this.prisma.amenity.findMany({
      where: { code: { not: "furnished" } },
      select: { id: true, name: true, category: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  @Get("house-rules")
  houseRules() {
    return this.prisma.houseRule.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }
}
