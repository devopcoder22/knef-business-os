/**
 * Stage 22 — Health Endpoint Tests
 *
 * Coverage:
 *  1.  GET /health/live — returns {status:'ok'} without calling any external dependency
 *  2.  GET /health/live — uptime is a non-negative number
 *  3.  GET /health/live — timestamp is a valid ISO string
 *  4.  GET /health/ready — calls prismaHealth.isHealthy
 *  5.  GET /health/ready — calls redisHealth.isHealthy
 *  6.  GET /health (legacy) — calls both prismaHealth and redisHealth
 *  7.  Liveness never invokes HealthCheckService (no external dep check)
 *  8.  Readiness propagates database failure (KNEF wiring produces failure)
 *  9.  Readiness propagates Redis failure (KNEF wiring produces failure)
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function makeHealthService(result: Record<string, unknown> = { status: 'ok' }) {
  return {
    check: jest.fn(async () => result),
  };
}

function makePrismaHealth() {
  return {
    isHealthy: jest.fn(async () => ({ database: { status: 'up' } })),
  };
}

function makeRedisHealth() {
  return {
    isHealthy: jest.fn(async () => ({ redis: { status: 'up' } })),
  };
}

describe('HealthController — liveness', () => {
  it('1: GET /health/live returns status ok without invoking HealthCheckService', () => {
    const healthSvc = makeHealthService();
    const ctrl = new HealthController(
      healthSvc as never,
      makePrismaHealth() as never,
      makeRedisHealth() as never,
    );

    const result = ctrl.liveness();

    expect(result.status).toBe('ok');
    expect(healthSvc.check).not.toHaveBeenCalled();
  });

  it('2: liveness uptime is a non-negative number', () => {
    const ctrl = new HealthController(
      makeHealthService() as never,
      makePrismaHealth() as never,
      makeRedisHealth() as never,
    );

    const result = ctrl.liveness();
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('3: liveness timestamp is a valid ISO string', () => {
    const ctrl = new HealthController(
      makeHealthService() as never,
      makePrismaHealth() as never,
      makeRedisHealth() as never,
    );

    const result = ctrl.liveness();
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('7: liveness service field is knef-api', () => {
    const ctrl = new HealthController(
      makeHealthService() as never,
      makePrismaHealth() as never,
      makeRedisHealth() as never,
    );

    const result = ctrl.liveness();
    expect(result.service).toBe('knef-api');
  });
});

describe('HealthController — readiness', () => {
  it('4: GET /health/ready invokes prismaHealth.isHealthy', async () => {
    const healthSvc = makeHealthService();
    const prisma = makePrismaHealth();
    const redis = makeRedisHealth();

    // Simulate how @nestjs/terminus calls the check functions
    healthSvc.check.mockImplementationOnce((async (...args: unknown[]) => {
      for (const fn of args[0] as (() => Promise<unknown>)[]) await fn();
      return { status: 'ok' };
    }) as never);

    const ctrl = new HealthController(healthSvc as never, prisma as never, redis as never);
    await ctrl.readiness();

    expect(prisma.isHealthy).toHaveBeenCalledWith('database');
  });

  it('5: GET /health/ready invokes redisHealth.isHealthy', async () => {
    const healthSvc = makeHealthService();
    const prisma = makePrismaHealth();
    const redis = makeRedisHealth();

    healthSvc.check.mockImplementationOnce((async (...args: unknown[]) => {
      for (const fn of args[0] as (() => Promise<unknown>)[]) await fn();
      return { status: 'ok' };
    }) as never);

    const ctrl = new HealthController(healthSvc as never, prisma as never, redis as never);
    await ctrl.readiness();

    expect(redis.isHealthy).toHaveBeenCalledWith('redis');
  });
});

describe('HealthController — legacy GET /health', () => {
  it('6: GET /health calls both prisma and redis health indicators', async () => {
    const healthSvc = makeHealthService();
    const prisma = makePrismaHealth();
    const redis = makeRedisHealth();

    healthSvc.check.mockImplementationOnce((async (...args: unknown[]) => {
      for (const fn of args[0] as (() => Promise<unknown>)[]) await fn();
      return { status: 'ok' };
    }) as never);

    const ctrl = new HealthController(healthSvc as never, prisma as never, redis as never);
    await ctrl.check();

    expect(prisma.isHealthy).toHaveBeenCalledWith('database');
    expect(redis.isHealthy).toHaveBeenCalledWith('redis');
  });
});

// ── Failure path: KNEF wiring produces unhealthy when a dependency fails ──────
//
// HealthCheckService.check() throws ServiceUnavailableException when any
// indicator fails. These tests verify that HealthController does NOT suppress
// that exception — it propagates to NestJS which returns HTTP 503.

describe('HealthController — readiness failure paths', () => {
  it('8: database failure — HealthCheckService throws → readiness propagates ServiceUnavailableException', async () => {
    const healthSvc = makeHealthService();
    // Simulate @nestjs/terminus throwing when DB indicator fails
    healthSvc.check.mockRejectedValueOnce(
      new ServiceUnavailableException({ status: 'error', info: {}, error: { database: { status: 'down' } } }),
    );

    const ctrl = new HealthController(healthSvc as never, makePrismaHealth() as never, makeRedisHealth() as never);
    await expect(ctrl.readiness()).rejects.toThrow(ServiceUnavailableException);
  });

  it('9: Redis failure — HealthCheckService throws → readiness propagates ServiceUnavailableException', async () => {
    const healthSvc = makeHealthService();
    healthSvc.check.mockRejectedValueOnce(
      new ServiceUnavailableException({ status: 'error', info: {}, error: { redis: { status: 'down' } } }),
    );

    const ctrl = new HealthController(healthSvc as never, makePrismaHealth() as never, makeRedisHealth() as never);
    await expect(ctrl.readiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
