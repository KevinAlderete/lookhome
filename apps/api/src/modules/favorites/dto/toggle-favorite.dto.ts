import { IsUUID } from "class-validator";

export class ToggleFavoriteDto {
  @IsUUID("4", { message: "userId debe ser UUID válido." })
  userId!: string;

  @IsUUID("4", { message: "roomId debe ser UUID válido." })
  roomId!: string;
}

export class FavoriteRoomDto {
  @IsUUID("4", { message: "roomId debe ser UUID válido." })
  roomId!: string;
}
