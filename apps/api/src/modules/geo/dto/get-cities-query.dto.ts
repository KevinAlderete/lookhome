import { IsUUID } from "class-validator";

export class GetCitiesQueryDto {
  @IsUUID("4", { message: "regionId debe ser un UUID válido." })
  regionId!: string;
}
