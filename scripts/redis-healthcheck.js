#!/usr/bin/env node
/**
 * Worker Redis healthcheck — uses only Node.js built-in modules.
 * Sends AUTH (if password configured) then PING over raw TCP.
 * Exits 0 on PONG, 1 on any failure.
 *
 * Used by Docker healthcheck in docker-compose.yml:
 *   test: ["CMD", "node", "/app/scripts/redis-healthcheck.js"]
 *
 * Reads REDIS_URL and REDIS_PASSWORD from environment.
 */
'use strict';

const net = require('net');
const { URL } = require('url');

const TIMEOUT_MS = 5000;

let redisHost = 'redis';
let redisPort = 6379;
let redisPassword = '';

try {
  const rawUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const parsed = new URL(rawUrl);
  redisHost = parsed.hostname || 'redis';
  redisPort = parseInt(parsed.port, 10) || 6379;
  // Password from URL (redis://:pass@host) or REDIS_PASSWORD env var
  redisPassword = parsed.password || process.env.REDIS_PASSWORD || '';
} catch (_) {
  redisPassword = process.env.REDIS_PASSWORD || '';
}

const timer = setTimeout(() => {
  process.exit(1);
}, TIMEOUT_MS);

const client = net.createConnection({ host: redisHost, port: redisPort }, () => {
  if (redisPassword) {
    const pw = redisPassword;
    const authCmd = `*2\r\n$4\r\nAUTH\r\n$${pw.length}\r\n${pw}\r\n`;
    const pingCmd = '*1\r\n$4\r\nPING\r\n';
    client.write(authCmd + pingCmd);
  } else {
    client.write('*1\r\n$4\r\nPING\r\n');
  }
});

let buffer = '';
client.on('data', (data) => {
  buffer += data.toString();
  // With auth: expect "+OK\r\n+PONG\r\n"
  // Without auth: expect "+PONG\r\n"
  if (redisPassword) {
    if (buffer.includes('+OK') && buffer.includes('+PONG')) {
      clearTimeout(timer);
      client.destroy();
      process.exit(0);
    } else if (buffer.includes('-') || buffer.includes('ERR')) {
      clearTimeout(timer);
      client.destroy();
      process.exit(1);
    }
  } else {
    clearTimeout(timer);
    client.destroy();
    process.exit(buffer.startsWith('+PONG') ? 0 : 1);
  }
});

client.once('error', () => {
  clearTimeout(timer);
  process.exit(1);
});
