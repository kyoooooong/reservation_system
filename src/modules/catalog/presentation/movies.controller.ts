import { Controller, Get, Header, Param } from "@nestjs/common";
import {
  DYNAMIC_CATALOG_CACHE_CONTROL,
  MOVIE_LIST_CACHE_CONTROL,
} from "../../../common/config/cache-policy";
import { ParsePositiveIntPipe } from "../../../common/http/parse-positive-int.pipe";
import { PublicRoute } from "../../../common/http/public-route.decorator";
import { CatalogQueryService } from "../application/catalog-query.service";

@PublicRoute()
@Controller("movies")
export class MoviesController {
  constructor(private readonly catalog: CatalogQueryService) {}

  @Get()
  @Header("Cache-Control", MOVIE_LIST_CACHE_CONTROL)
  listMovies() {
    return this.catalog.listMovies();
  }

  @Get(":movieId/screenings")
  @Header("Cache-Control", DYNAMIC_CATALOG_CACHE_CONTROL)
  listScreenings(@Param("movieId", ParsePositiveIntPipe) movieId: number) {
    return this.catalog.listScreenings(movieId);
  }
}
