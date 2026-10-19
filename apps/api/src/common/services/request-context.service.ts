import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

const store = new AsyncLocalStorage<RequestContext>();

@Injectable()
export class RequestContextService {
  run(ctx: RequestContext, fn: () => void): void {
    store.run(ctx, fn);
  }

  get(): RequestContext {
    return store.getStore() ?? {};
  }

  getIp(): string | undefined {
    return store.getStore()?.ipAddress;
  }

  getUserAgent(): string | undefined {
    return store.getStore()?.userAgent;
  }

  getRequestId(): string | undefined {
    return store.getStore()?.requestId;
  }
}

export { store as requestContextStore };
