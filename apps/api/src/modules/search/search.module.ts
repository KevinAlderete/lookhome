import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";

@Module({
  controllers: [SearchController],
  providers: [SearchService, OptionalJwtAuthGuard],
  exports: [SearchService],
})
export class SearchModule {}
