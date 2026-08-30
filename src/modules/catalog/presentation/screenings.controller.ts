import { Controller, Get, Header, Param } from "@nestjs/common";
import { DYNAMIC_CATALOG_CACHE_CONTROL } from "../../../common/config/cache-policy";
import { ParsePositiveIntPipe } from "../../../common/http/parse-positive-int.pipe";
import { PublicRoute } from "../../../common/http/public-route.decorator";
import { CatalogQueryService } from "../application/catalog-query.service";

@PublicRoute()
@Controller("screenings")
export class ScreeningsController {
  constructor(private readonly catalog: CatalogQueryService) {}

  @Get(":screeningId/seats")
  @Header("Cache-Control", DYNAMIC_CATALOG_CACHE_CONTROL)
  getSeats(@Param("screeningId", ParsePositiveIntPipe) screeningId: number) {
    return this.catalog.getSeatMap(screeningId);
  }
}
