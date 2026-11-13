import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: false });
  app.setGlobalPrefix("api");
  const port = Number.parseInt(process.env.PORT ?? "4000", 10);
  await app.listen(port);
  console.log(`한성 메이트 DEMO API: http://localhost:${port}/api/health`);
}

await bootstrap();

