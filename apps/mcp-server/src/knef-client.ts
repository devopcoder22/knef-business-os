/**
 * KNEF REST API client used by the MCP server.
 * All tool invocations go through the KNEF agent gateway — never directly to the database.
 */

export interface KnefConfig {
  baseUrl: string;
  apiKey: string;
  organizationId?: string;
}

export interface ToolResult {
  requestId: string;
  toolName: string;
  outcome: 'ADVISORY' | 'DRAFT' | 'QUEUED_FOR_APPROVAL' | 'EXECUTED' | 'BLOCKED';
  result?: unknown;
  actionId?: string;
  approvalId?: string;
  expiresAt?: string;
  reason?: string;
  suggestion?: string;
}

export interface KnefTool {
  name: string;
  description: string;
  category: string;
  riskLevel: string;
  approvalRequired: string;
  requiredScope?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

import { randomUUID } from 'crypto';

export class KnefApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: KnefConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  async listTools(): Promise<KnefTool[]> {
    const res = await this.request<{ tools: KnefTool[]; count: number }>(
      'GET',
      '/api/v1/agent/tools',
    );
    return res.data?.tools ?? [];
  }

  async executeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<ToolResult> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await this.request<ToolResult>(
      'POST',
      `/api/v1/agent/tools/${encodeURIComponent(toolName)}/execute`,
      { parameters, idempotencyKey },
      headers,
    );

    if (!res.data) {
      throw new Error(`No result from tool ${toolName}: ${JSON.stringify(res.error)}`);
    }

    return res.data;
  }

  async getHealth(): Promise<{ status: string; agentId: string; organizationId: string }> {
    const res = await this.request<{ status: string; agentId: string; organizationId: string }>(
      'GET',
      '/api/v1/agent/health',
    );
    return res.data ?? { status: 'unknown', agentId: '', organizationId: '' };
  }

  async getMe(): Promise<Record<string, unknown>> {
    const res = await this.request<Record<string, unknown>>('GET', '/api/v1/agent/me');
    return res.data ?? {};
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ data?: T; error?: unknown }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
      'X-Request-Id': randomUUID(),
      ...extraHeaders,
    };

    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    const response = await fetch(url, init);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      return { error: errorBody };
    }

    const json = await response.json() as { data?: T };
    return { data: json.data ?? (json as unknown as T) };
  }
}
