import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchDto } from "./dto/search.dto";
import { SearchClickDto } from "./dto/search-click.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { SuggestLocationsDto } from "./dto/suggest-locations.dto";
import { ResolveLocationDto } from "./dto/resolve-location.dto";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  search(@Query() query: SearchDto, @CurrentUser() user?: any) {
    return this.searchService.search(query, user?.id);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get("featured")
  featured(@CurrentUser() user?: any) {
    return this.searchService.searchFeatured(user?.id);
  }
  @Public()
  @Post("click")
  trackClick(@Body() body: SearchClickDto) {
    return this.searchService.trackClick(body);
  }

  @Public()
  @Get("locations/suggest")
  suggestLocations(@Query() query: SuggestLocationsDto) {
    return this.searchService.suggestLocations(query.q ?? "", query.type);
  }

  @Public()
  @Get("locations/resolve")
  resolveLocation(@Query() query: ResolveLocationDto) {
    return this.searchService.resolveLocation(query.type, query.id);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get("markers")
  markers(@Query() query: SearchDto, @CurrentUser() user?: any) {
    return this.searchService.searchMarkers(query, user?.id);
  }
}
