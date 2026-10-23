import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { JsonSerializerInterceptor } from "./common/interceptors/json-serializer.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const appUrl = process.env.APP_URL ?? "http://localhost:4321";

  app.setGlobalPrefix("api");
  app.useStaticAssets(process.env.UPLOAD_ROOT ?? join(process.cwd(), "uploads"), {
    prefix: "/uploads/",
    maxAge: "1y",
    immutable: true,
    setHeaders: (response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
    },
  });
  app.useGlobalInterceptors(new JsonSerializerInterceptor());

  app.enableCors({
    origin: [appUrl, "http://localhost:4321", "http://127.0.0.1:4321"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
}

bootstrap();
