import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  const appUrl = configService.get<string>('APP_URL', 'http://localhost:3000');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: nodeEnv === 'production',
    }),
  );

  // Cookie parser (needed for httpOnly refresh token)
  app.use(cookieParser());

  // Request ID middleware
  app.use(RequestIdMiddleware);

  // CORS
  app.enableCors({
    origin: [appUrl, 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response transform interceptor
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger / OpenAPI
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('KNEF Business OS API')
      .setDescription('Production-grade ERP + AI platform for KNEF Gadgets, Lagos Nigeria')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('organizations', 'Organization settings')
      .addTag('locations', 'Location management')
      .addTag('departments', 'Department management')
      .addTag('roles', 'Role & permission management')
      .addTag('permissions', 'Permission registry')
      .addTag('feature-flags', 'Feature flag management')
      .addTag('audit', 'Audit log')
      .addTag('settings', 'System settings')
      .addTag('health', 'Health checks')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`KNEF Business OS API listening on port ${port} [${nodeEnv}]`);
}

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
