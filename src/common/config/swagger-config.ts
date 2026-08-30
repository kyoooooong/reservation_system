import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { API_VERSION, SWAGGER_PATH } from "./api-config";

export const configureSwagger = (app: INestApplication): void => {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Movie Reservation API")
      .setDescription("GC MediEye assignment API")
      .setVersion(API_VERSION)
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
};
