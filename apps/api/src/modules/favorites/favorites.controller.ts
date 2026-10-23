import { Body, Controller, Delete, Get, Post } from "@nestjs/common";
import { FavoritesService } from "./favorites.service";
import { FavoriteRoomDto } from "./dto/toggle-favorite.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  add(
    @CurrentUser() user: any,
    @Body() body: FavoriteRoomDto,
  ) {
    return this.favoritesService.add({
      userId: user.id,
      roomId: body.roomId,
    });
  }

  @Delete()
  remove(
    @CurrentUser() user: any,
    @Body() body: FavoriteRoomDto,
  ) {
    return this.favoritesService.remove({
      userId: user.id,
      roomId: body.roomId,
    });
  }

  @Get("me")
  listMine(@CurrentUser() user: any) {
    return this.favoritesService.listByUser(user.id);
  }
}
