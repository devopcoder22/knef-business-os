import { DocumentsProcessor } from './documents.processor';
import { JOB_TYPES } from '@knef/constants';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';

function makeDoc(overrides: Partial<{
  id: string;
  organizationId: string;
  title: string;
  content: string;
  status: string;
}> = {}) {
  return {
    id: 'doc-1',
    organizationId: 'org-1',
    title: 'Test Doc',
    content: 'hello world this is test content for chunking',
    status: 'PENDING',
    ...overrides,
  };
}

function makePrisma(doc: unknown = makeDoc()) {
  return {
    aIDocument: {
      findFirst: jest.fn(async () => doc),
      update: jest.fn(async () => doc),
    },
    aIDocumentChunk: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({})),
    },
  };
}

function makeEmbedding() {
  return {
    generateEmbedding: jest.fn(async () => Array(1536).fill(0.1)),
    storeEmbedding: jest.fn(async () => undefined),
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: unknown) => def), getOrThrow: jest.fn(() => 'enc-key') };
}

function makeJob(data: unknown): Job {
  return { id: 'j-1', name: JOB_TYPES.INGEST_DOCUMENT, data } as Job;
}

describe('DocumentsProcessor', () => {
  function makeProcessor(doc: unknown = makeDoc()) {
    const prisma = makePrisma(doc);
    const embedding = makeEmbedding();
    const config = makeConfig();
    const processor = new DocumentsProcessor(prisma as never, embedding as never, config as never);
    return { processor, prisma, embedding };
  }

  it('marks document PROCESSING then READY on success', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    const updateCalls = (prisma.aIDocument.update as jest.Mock).mock.calls;
    expect(updateCalls[0][0].data.status).toBe('PROCESSING');
    const lastCall = updateCalls[updateCalls.length - 1][0];
    expect(lastCall.data.status).toBe('READY');
  });

  it('throws UnrecoverableError when document not found', async () => {
    const { processor } = makeProcessor(null);
    const job = makeJob({ documentId: 'missing', organizationId: 'org-1' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toThrow(UnrecoverableError);
  });

  it('throws UnrecoverableError for empty content', async () => {
    const { processor } = makeProcessor(makeDoc({ content: '   ' }));
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toThrow(UnrecoverableError);
  });

  it('throws UnrecoverableError for content exceeding 10MB', async () => {
    const bigContent = 'x'.repeat(11 * 1024 * 1024);
    const { processor } = makeProcessor(makeDoc({ content: bigContent }));
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toThrow(UnrecoverableError);
  });

  it('deletes existing chunks before creating new ones (safe reindex)', async () => {
    const callOrder: string[] = [];
    const { processor, prisma } = makeProcessor();
    (prisma.aIDocumentChunk.deleteMany as jest.Mock).mockImplementation(async () => {
      callOrder.push('deleteMany');
      return { count: 0 };
    });
    (prisma.aIDocumentChunk.create as jest.Mock).mockImplementation(async () => {
      callOrder.push('create');
      return {};
    });
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(callOrder[0]).toBe('deleteMany');
    expect(callOrder.filter((c) => c === 'create').length).toBeGreaterThan(0);
    expect(callOrder.indexOf('create')).toBeGreaterThan(callOrder.indexOf('deleteMany'));
  });

  it('creates one chunk record per text chunk', async () => {
    const { processor, prisma } = makeProcessor(makeDoc({ content: 'word '.repeat(600) }));
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    // 600 words / 500 per chunk with overlap = 2 chunks
    expect(prisma.aIDocumentChunk.create).toHaveBeenCalledTimes(2);
  });

  it('calls generateEmbedding and storeEmbedding for each chunk', async () => {
    const { processor, embedding } = makeProcessor(makeDoc({ content: 'word '.repeat(600) }));
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(embedding.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(embedding.storeEmbedding).toHaveBeenCalledTimes(2);
  });

  it('sets status FAILED and re-throws on unexpected error', async () => {
    const { processor, prisma, embedding } = makeProcessor();
    embedding.generateEmbedding.mockRejectedValue(new Error('network error'));
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await expect(
      (processor as unknown as { process: (j: Job) => Promise<void> }).process(job),
    ).rejects.toThrow('network error');

    const updateCalls = (prisma.aIDocument.update as jest.Mock).mock.calls;
    const failedCall = updateCalls.find((c: unknown[]) =>
      (c[0] as { data: { status: string } }).data.status === 'FAILED',
    );
    expect(failedCall).toBeDefined();
  });

  it('ignores unknown job types', async () => {
    const { processor, prisma } = makeProcessor();
    const job = { id: 'j-1', name: 'UNKNOWN', data: {} } as Job;

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(prisma.aIDocument.findFirst).not.toHaveBeenCalled();
  });

  it('skips storeEmbedding when generateEmbedding returns null', async () => {
    const { processor, embedding } = makeProcessor();
    embedding.generateEmbedding.mockResolvedValue(null as unknown as number[]);
    const job = makeJob({ documentId: 'doc-1', organizationId: 'org-1' });

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(embedding.storeEmbedding).not.toHaveBeenCalled();
  });
});
