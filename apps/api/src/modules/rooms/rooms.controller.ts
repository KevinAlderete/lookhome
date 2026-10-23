import {
  Body,
  Controller,
  Delete,
  GoneException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { FindRoomsQueryDto } from "./dto/find-rooms-query.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";
import { Public } from "../auth/decorators/public.decorator";

@Controller("rooms")
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @Public()
  findAll(@Query() query: FindRoomsQueryDto) {
    return this.roomsService.findAll(query);
  }

  @Get(":id")
  @Public()
  findOne(@Param("id") id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @Roles("host", "admin")
  @Ownership("listing")
  create(@Body() body: CreateRoomDto) {
    void body;
    throw new GoneException(
      "La creación de ofertas se gestiona desde el borrador del anuncio.",
    );
  }

  @Patch(":id")
  @Roles("host", "admin")
  @Ownership("room")
  update(@Param("id") id: string, @Body() body: UpdateRoomDto) {
    void id;
    void body;
    throw new GoneException(
      "Edita la oferta desde PATCH /host/listings/:id.",
    );
  }

  @Patch(":id/publish")
  @Roles("host", "admin")
  @Ownership("room")
  publish(@Param("id") id: string) {
    void id;
    throw new GoneException(
      "El estado de publicación se gestiona en el anuncio.",
    );
  }

  @Patch(":id/pause")
  @Roles("host", "admin")
  @Ownership("room")
  pause(@Param("id") id: string) {
    void id;
    throw new GoneException(
      "El estado de publicación se gestiona en el anuncio.",
    );
  }

  @Delete(":id")
  @Roles("host", "admin")
  @Ownership("room")
  remove(@Param("id") id: string) {
    void id;
    throw new GoneException(
      "No se eliminan ofertas individualmente para conservar reservas e historial. Archiva el anuncio si ya no está disponible.",
    );
  }
}
