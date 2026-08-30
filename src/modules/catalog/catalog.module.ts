import { Module } from "@nestjs/common";
import { CatalogQueryService } from "./application/catalog-query.service";
import { MoviesController } from "./presentation/movies.controller";
import { ScreeningsController } from "./presentation/screenings.controller";

@Module({
  controllers: [MoviesController, ScreeningsController],
  providers: [CatalogQueryService],
})
export class CatalogModule {}
