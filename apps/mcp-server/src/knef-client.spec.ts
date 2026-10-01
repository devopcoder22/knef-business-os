/**
 * Unit tests for KnefApiClient
 * MCP transport tests use mocked fetch.
 */

import { KnefApiClient } from './knef-client.js';

const MOCK_BASE = 'http://localhost:4000';
const MOCK_KEY = 'knef_agent_test_key';

function mockFetch(response: unknown, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(response),
    text: jest.fn().mockResolvedValue(String(response)),
  }) as jest.Mock;
}

describe('KnefApiClient', () => {
  let client: KnefApiClient;

  beforeEach(() => {
    client = new KnefApiClient({ baseUrl: MOCK_BASE, apiKey: MOCK_KEY });
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('returns health status', async () => {
      mockFetch({ status: 'ok', agentId: 'agent-1', organizationId: 'org-1' });
      const result = await client.getHealth();
      expect(result.status).toBe('ok');
      expect(global.fetch).toHaveBeenCalledWith(
        `${MOCK_BASE}/api/v1/agent/health`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'X-Api-Key': MOCK_KEY }),
        }),
      );
    });
  });

  describe('listTools', () => {
    it('returns tools array', async () => {
      mockFetch({
        tools: [
          { name: 'get_inventory_levels', description: 'Read inventory', category: 'inventory' },
        ],
        count: 1,
      });
      const tools = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get_inventory_levels');
    });

    it('returns empty array when no data', async () => {
      mockFetch({});
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('executeTool', () => {
    it('executes tool and returns result', async () => {
      const mockResult = {
        requestId: 'req-1',
        toolName: 'get_inventory_levels',
        outcome: 'EXECUTED',
        result: { levels: [] },
      };
      mockFetch(mockResult);

      const result = await client.executeTool('get_inventory_levels', { productId: 'p1' });
      expect(result.outcome).toBe('EXECUTED');
      expect(result.requestId).toBe('req-1');
    });

    it('includes idempotency key header when provided', async () => {
      mockFetch({
        requestId: 'req-2',
        toolName: 'create_task',
        outcome: 'EXECUTED',
        result: { task: { id: 't1' } },
      });

      await client.executeTool('create_task', { title: 'Test' }, 'idem-key-123');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Idempotency-Key': 'idem-key-123' }),
        }),
      );
    });

    it('throws when API returns error', async () => {
      mockFetch({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
      await expect(
        client.executeTool('get_inventory_levels', {}),
      ).rejects.toThrow();
    });

    it('sends X-Api-Key in all requests', async () => {
      mockFetch({ requestId: 'r', toolName: 't', outcome: 'EXECUTED', result: {} });
      await client.executeTool('get_inventory_levels', {});
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': MOCK_KEY }),
        }),
      );
    });
  });

  describe('base URL normalization', () => {
    it('strips trailing slash from base URL', async () => {
      const clientWithSlash = new KnefApiClient({
        baseUrl: `${MOCK_BASE}/`,
        apiKey: MOCK_KEY,
      });
      mockFetch({ status: 'ok', agentId: '', organizationId: '' });
      await clientWithSlash.getHealth();
      expect(global.fetch).toHaveBeenCalledWith(
        `${MOCK_BASE}/api/v1/agent/health`,
        expect.anything(),
      );
    });
  });
});
