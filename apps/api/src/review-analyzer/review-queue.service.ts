import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

type AnalyzeJob = { reviewId: string };
type ImportRetryJob = { jobId: string };

@Injectable()
export class ReviewQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewQueueService.name);
  private connection: IORedis | null = null;
  private analyzeQueue: Queue | null = null;
  private importQueue: Queue | null = null;
  private analyzeWorker: Worker | null = null;
  private importWorker: Worker | null = null;
  private analyzeHandler: ((reviewId: string) => Promise<void>) | null = null;
  private importRetryHandler: ((jobId: string) => Promise<void>) | null = null;

  private redisUrl() {
    return process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
  }

  registerHandlers(opts: {
    analyze: (reviewId: string) => Promise<void>;
    importRetry: (jobId: string) => Promise<void>;
  }) {
    this.analyzeHandler = opts.analyze;
    this.importRetryHandler = opts.importRetry;
  }

  async onModuleInit() {
    try {
      this.connection = new IORedis(this.redisUrl(), { maxRetriesPerRequest: null });
      await this.connection.ping();
      this.analyzeQueue = new Queue('review-analyze', { connection: this.connection });
      this.importQueue = new Queue('review-import', { connection: this.connection });
      this.analyzeWorker = new Worker<AnalyzeJob>(
        'review-analyze',
        async (job: Job<AnalyzeJob>) => {
          if (this.analyzeHandler) await this.analyzeHandler(job.data.reviewId);
        },
        { connection: this.connection, concurrency: 2 },
      );
      this.importWorker = new Worker<ImportRetryJob>(
        'review-import',
        async (job: Job<ImportRetryJob>) => {
          if (this.importRetryHandler) await this.importRetryHandler(job.data.jobId);
        },
        { connection: this.connection, concurrency: 1 },
      );
      this.logger.log('BullMQ review queues connected');
    } catch (err) {
      this.logger.warn(
        `Redis/BullMQ unavailable (${(err as Error).message}) — using in-process queue`,
      );
      this.connection = null;
      this.analyzeQueue = null;
      this.importQueue = null;
    }
  }

  async onModuleDestroy() {
    await this.analyzeWorker?.close().catch(() => undefined);
    await this.importWorker?.close().catch(() => undefined);
    await this.analyzeQueue?.close().catch(() => undefined);
    await this.importQueue?.close().catch(() => undefined);
    this.connection?.disconnect();
  }

  async enqueueAnalyze(reviewId: string) {
    if (this.analyzeQueue) {
      await this.analyzeQueue.add('analyze', { reviewId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      return;
    }
    setImmediate(async () => {
      try {
        if (this.analyzeHandler) await this.analyzeHandler(reviewId);
      } catch (e) {
        this.logger.warn(`In-process analyze failed: ${(e as Error).message}`);
      }
    });
  }

  async enqueueImportRetry(jobId: string) {
    if (this.importQueue) {
      await this.importQueue.add(
        'retry',
        { jobId },
        { delay: 60_000, attempts: 2, backoff: { type: 'fixed', delay: 120_000 } },
      );
      return;
    }
    setTimeout(async () => {
      try {
        if (this.importRetryHandler) await this.importRetryHandler(jobId);
      } catch (e) {
        this.logger.warn(`In-process import retry failed: ${(e as Error).message}`);
      }
    }, 60_000);
  }
}
