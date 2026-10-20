import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SsrfGuardService } from './ssrf-guard.service';

// Mock DNS lookup to avoid real DNS calls in unit tests
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'dns/promises';
const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('SsrfGuardService', () => {
  let service: SsrfGuardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SsrfGuardService],
    }).compile();

    service = module.get<SsrfGuardService>(SsrfGuardService);
  });

  it('allows public HTTPS URLs', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '142.250.80.46', family: 4 }] as never);
    await expect(service.assertSafeUrl('https://cdn.example.com/img.jpg')).resolves.toBeUndefined();
  });

  it('allows public HTTP URLs', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '104.21.44.100', family: 4 }] as never);
    await expect(service.assertSafeUrl('http://media.example.com/v.mp4')).resolves.toBeUndefined();
  });

  it('throws for localhost', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(service.assertSafeUrl('http://localhost/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 127.x.x.x IP literal', async () => {
    await expect(service.assertSafeUrl('http://127.0.0.1/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 10.x.x.x', async () => {
    await expect(service.assertSafeUrl('http://10.0.0.1/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 172.16.x.x', async () => {
    await expect(service.assertSafeUrl('http://172.16.0.1/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 172.31.x.x', async () => {
    await expect(service.assertSafeUrl('http://172.31.255.255/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 192.168.x.x', async () => {
    await expect(service.assertSafeUrl('http://192.168.1.100/secret')).rejects.toThrow(BadRequestException);
  });

  it('throws for 169.254.x.x (link-local)', async () => {
    await expect(service.assertSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(BadRequestException);
  });

  it('throws for non-http protocol (file://)', async () => {
    await expect(service.assertSafeUrl('file:///etc/passwd')).rejects.toThrow(BadRequestException);
  });

  it('throws for invalid URL', async () => {
    await expect(service.assertSafeUrl('not-a-url')).rejects.toThrow(BadRequestException);
  });

  it('throws when DNS resolves to private IP', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }] as never);
    await expect(service.assertSafeUrl('https://attacker.example.com/img.jpg')).rejects.toThrow(BadRequestException);
  });

  it('throws when hostname is "metadata" (GCP SSRF)', async () => {
    await expect(service.assertSafeUrl('http://metadata/computeMetadata/v1')).rejects.toThrow(BadRequestException);
  });
});
