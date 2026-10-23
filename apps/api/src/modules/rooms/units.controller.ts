import { Body, Controller, GoneException, Param, Patch, Post } from "@nestjs/common";
import { Ownership } from "../auth/decorators/ownership.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateUnitDto } from "./dto/create-unit.dto";

@Controller("units")
@Roles("host", "admin")
export class UnitsController {
  @Post()
  @Ownership("listing")
  create(@Body() body: CreateUnitDto) {
    void body;
    throw new GoneException(
      "La creación de ofertas se gestiona desde el borrador del anuncio.",
    );
  }

  @Patch(":id/publish")
  @Ownership("room")
  publish(@Param("id") id: string) {
    void id;
    throw new GoneException(
      "El estado de publicación se gestiona en el anuncio.",
    );
  }
}
