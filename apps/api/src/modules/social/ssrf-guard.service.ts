import { Injectable, BadRequestException } from '@nestjs/common';
import * as net from 'net';
import { lookup } from 'dns/promises';

// Private/reserved IP ranges that must never be fetched
const BLOCKED_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

const BLOCKED_HOSTNAMES = ['localhost', 'metadata', 'metadata.google.internal'];

@Injectable()
export class SsrfGuardService {
  async assertSafeUrl(urlStr: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      throw new BadRequestException('Invalid media URL.');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new BadRequestException('Media URL must use http or https.');
    }

    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      throw new BadRequestException('Media URL hostname is not permitted.');
    }

    // Resolve DNS and verify the IP is public
    if (!net.isIP(hostname)) {
      let addresses: string[];
      try {
        const result = await lookup(hostname, { all: true });
        addresses = result.map((r) => r.address);
      } catch {
        throw new BadRequestException('Media URL hostname could not be resolved.');
      }
      for (const addr of addresses) {
        this.assertPublicIp(addr);
      }
    } else {
      this.assertPublicIp(hostname);
    }
  }

  private assertPublicIp(ip: string): void {
    for (const re of BLOCKED_RANGES) {
      if (re.test(ip)) {
        throw new BadRequestException('Media URL resolves to a private or reserved address.');
      }
    }
  }
}
