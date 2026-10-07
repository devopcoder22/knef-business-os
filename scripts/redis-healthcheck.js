#!/usr/bin/env node
/**
 * Worker Redis healthcheck — uses only Node.js built-in modules.
 * Sends a raw Redis PING over TCP and exits 0 on PONG, 1 on any failure.
 *
 * Used by Docker healthcheck in docker-compose.yml:
 *   test: ["CMD", "node", "/app/scripts/redis-healthcheck.js"]
 *
 * Reads REDIS_URL from environment. Falls back to redis://redis:6379.
 */
'use strict';

const net = require('net');
const { URL } = require('url');

const TIMEOUT_MS = 5000;

let redisHost = 'redis';
let redisPort = 6379;

try {
  const rawUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const parsed = new URL(rawUrl);
  redisHost = parsed.hostname || 'redis';
  redisPort = parseInt(parsed.port, 10) || 6379;
} catch (_) {
  // use defaults
}

const timer = setTimeout(() => {
  process.exit(1);
}, TIMEOUT_MS);

const client = net.createConnection({ host: redisHost, port: redisPort }, () => {
  // inline PING command in RESP protocol
  client.write('*1\r\n$4\r\nPING\r\n');
});

client.once('data', (data) => {
  clearTimeout(timer);
  client.destroy();
  // Redis responds with +PONG\r\n
  process.exit(data.toString().startsWith('+PONG') ? 0 : 1);
});

client.once('error', () => {
  clearTimeout(timer);
  process.exit(1);
});
