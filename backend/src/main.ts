import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

// Refuse de démarrer en production avec les secrets JWT par défaut du
// dépôt (dev_access_secret / dev_refresh_secret) : une négligence courante
// qui permettrait à quiconque de forger des tokens valides.
function assertProductionSecretsAreSet() {
  const isProd = (process.env.ELYSIA_ENV ?? 'development') === 'production';
  if (!isProd) return;
  const insecureDefaults = ['dev_access_secret', 'dev_refresh_secret', undefined, ''];
  if (
    insecureDefaults.includes(process.env.JWT_ACCESS_SECRET) ||
    insecureDefaults.includes(process.env.JWT_REFRESH_SECRET)
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET doivent être définis à des valeurs fortes en production (ELYSIA_ENV=production).',
    );
  }
}

async function bootstrap() {
  assertProductionSecretsAreSet();

  // En production, restreindre via DASHBOARD_URL (une seule origine de
  // confiance) plutôt que cors:true (reflète n'importe quelle origine).
  const allowedOrigin = process.env.DASHBOARD_URL;
  const app = await NestFactory.create(AppModule, {
    cors: { origin: allowedOrigin ?? true, credentials: true },
    rawBody: true,
  });

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new PermissionsGuard(reflector));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Elysia Panel API')
    .setDescription('API REST du Backend Elysia Panel — voir sdk/typescript pour un client généré.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.BACKEND_HTTP_PORT ?? 9401;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Elysia Backend listening on :${port}`);
}
bootstrap();
