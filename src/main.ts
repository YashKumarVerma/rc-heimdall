import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as config from 'config';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /** binding port to service */
  await app.listen(config.get('server.port'));
}
bootstrap();
