import { Injectable, Logger } from '@nestjs/common';
import { SHOPIFY_API_VERSION } from './shopify.constants';

export interface GraphQLResult<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[]; path?: string[] }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
    };
  };
}

export interface UserError {
  field: string[];
  message: string;
  code?: string;
}

@Injectable()
export class ShopifyGraphQLClient {
  private readonly logger = new Logger(ShopifyGraphQLClient.name);
  private static readonly MAX_RETRIES = 3;
  private static readonly THROTTLE_SLEEP_MS = 2000;

  async query<T = unknown>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResult<T>> {
    return this.execute<T>(shopDomain, accessToken, query, variables);
  }

  async mutate<T = unknown>(
    shopDomain: string,
    accessToken: string,
    mutation: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResult<T>> {
    return this.execute<T>(shopDomain, accessToken, mutation, variables);
  }

  private async execute<T>(
    shopDomain: string,
    accessToken: string,
    document: string,
    variables?: Record<string, unknown>,
    attempt = 0,
  ): Promise<GraphQLResult<T>> {
    const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: document, variables }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < ShopifyGraphQLClient.MAX_RETRIES) {
          const delay = ShopifyGraphQLClient.THROTTLE_SLEEP_MS * (attempt + 1);
          this.logger.warn(`Shopify ${res.status} on ${shopDomain}, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await new Promise(r => setTimeout(r, delay));
          return this.execute<T>(shopDomain, accessToken, document, variables, attempt + 1);
        }
        throw new Error(`Shopify API ${res.status} after ${ShopifyGraphQLClient.MAX_RETRIES} retries`);
      }

      if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);

      const result = await res.json() as GraphQLResult<T>;

      // Check available cost and throttle proactively
      const cost = result.extensions?.cost;
      if (cost && cost.throttleStatus.currentlyAvailable < 100) {
        const wait = Math.ceil(
          (200 - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate,
        ) * 1000;
        this.logger.warn(
          `Shopify low query budget (${cost.throttleStatus.currentlyAvailable}), waiting ${wait}ms`,
        );
        await new Promise(r => setTimeout(r, Math.min(wait, 10_000)));
      }

      return result;
    } catch (err: unknown) {
      if (attempt < ShopifyGraphQLClient.MAX_RETRIES && this.isRetryable(err)) {
        await new Promise(r => setTimeout(r, ShopifyGraphQLClient.THROTTLE_SLEEP_MS * (attempt + 1)));
        return this.execute<T>(shopDomain, accessToken, document, variables, attempt + 1);
      }
      throw err;
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof Error) {
      return (
        err.name === 'AbortError' ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT')
      );
    }
    return false;
  }

  /** Extract pagination cursor from edges */
  static endCursor(pageInfo: { endCursor?: string | null; hasNextPage: boolean }): string | null {
    return pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;
  }
}
