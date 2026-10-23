import { IsUUID } from "class-validator";

export class GetDistrictsQueryDto {
  @IsUUID("4", { message: "cityId debe ser un UUID válido." })
  cityId!: string;
}
