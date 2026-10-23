import { Type } from "class-transformer";
import { IsLatitude, IsLongitude } from "class-validator";

export class AddressReverseQueryDto {
  @Type(() => Number)
  @IsLatitude({ message: "lat debe ser una latitud válida." })
  lat!: number;

  @Type(() => Number)
  @IsLongitude({ message: "lng debe ser una longitud válida." })
  lng!: number;
}
