import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSchedulerStoreGet = vi.fn();
const mockSchedulerStoreUpdate = vi.fn();
const mockSchedulerStoreList = vi.fn();
const mockTaskExecutorRun = vi.fn();
const mockCronSchedule = vi.fn();
const mockCronValidate = vi.fn();

vi.mock('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
    validate: mockCronValidate,
  },
}));

vi.mock('./store.js', () => ({
  schedulerStore: {
    get: mockSchedulerStoreGet,
    update: mockSchedulerStoreUpdate,
    list: mockSchedulerStoreList,
  },
}));

vi.mock('./executor.js', () => ({
  taskExecutor: { run: mockTaskExecutorRun },
}));

const makeJob = (nextRun?: Date) => ({
  stop: vi.fn(),
  destroy: vi.fn(),
  getNextRun: nextRun ? vi.fn().mockReturnValue(nextRun) : undefined,
});

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  name: '测试任务',
  enabled: true,
  trigger_type: 'cron' as const,
  cron_expr: '0 9 * * *',
  task_prompt: '每日总结',
  endpoint_name: 'gpt4',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('CronManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCronValidate.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('scheduleTask', () => {
    it('有效 cron 任务时注册 job 并更新 next_run_at', async () => {
      const nextRun = new Date('2026-04-30T09:00:00Z');
      const job = makeJob(nextRun);
      mockCronSchedule.mockReturnValue(job);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask());

      expect(mockCronSchedule).toHaveBeenCalledOnce();
      expect(mockSchedulerStoreUpdate).toHaveBeenCalledWith('task-1', {
        next_run_at: nextRun.toISOString(),
      });
    });

    it('disabled 任务时取消调度并清空 next_run_at', async () => {
      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask({ enabled: false }));

      expect(mockCronSchedule).not.toHaveBeenCalled();
      expect(mockSchedulerStoreUpdate).toHaveBeenCalledWith('task-1', { next_run_at: undefined });
    });

    it('非 cron trigger 时取消调度', async () => {
      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask({ trigger_type: 'webhook' }));

      expect(mockCronSchedule).not.toHaveBeenCalled();
    });

    it('无效 cron 表达式时抛出错误', async () => {
      mockCronValidate.mockReturnValue(false);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();

      expect(() => mgr.scheduleTask(makeTask({ cron_expr: 'invalid' }))).toThrow(
        '无效的 Cron 表达式'
      );
    });

    it('重复 schedule 同一任务时先取消旧 job', async () => {
      const job1 = makeJob();
      const job2 = makeJob();
      mockCronSchedule.mockReturnValueOnce(job1).mockReturnValueOnce(job2);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask());
      mgr.scheduleTask(makeTask());

      expect(job1.stop).toHaveBeenCalledOnce();
      expect(job1.destroy).toHaveBeenCalledOnce();
      expect(mockCronSchedule).toHaveBeenCalledTimes(2);
    });
  });

  describe('unscheduleTask', () => {
    it('存在 job 时停止并销毁', async () => {
      const job = makeJob();
      mockCronSchedule.mockReturnValue(job);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask());
      mgr.unscheduleTask('task-1');

      expect(job.stop).toHaveBeenCalledOnce();
      expect(job.destroy).toHaveBeenCalledOnce();
    });

    it('不存在 job 时静默忽略', async () => {
      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      expect(() => mgr.unscheduleTask('nonexistent')).not.toThrow();
    });
  });

  describe('loadAll', () => {
    it('只为 enabled + cron 任务注册 job', async () => {
      mockSchedulerStoreList.mockReturnValue([
        makeTask({ id: 'task-1' }),
        makeTask({ id: 'task-2', enabled: false }),
        makeTask({ id: 'task-3', trigger_type: 'webhook' }),
      ]);
      mockCronSchedule.mockReturnValue(makeJob());

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.loadAll();

      expect(mockCronSchedule).toHaveBeenCalledOnce();
    });
  });

  describe('refreshTask', () => {
    it('任务存在时重新 schedule', async () => {
      mockSchedulerStoreGet.mockReturnValue(makeTask());
      mockCronSchedule.mockReturnValue(makeJob());

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.refreshTask('task-1');

      expect(mockCronSchedule).toHaveBeenCalledOnce();
    });

    it('任务不存在时取消调度', async () => {
      mockSchedulerStoreGet.mockReturnValue(undefined);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.refreshTask('task-1');

      expect(mockCronSchedule).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('停止所有已注册的 job', async () => {
      const job1 = makeJob();
      const job2 = makeJob();
      mockCronSchedule.mockReturnValueOnce(job1).mockReturnValueOnce(job2);

      const { CronManager } = await import('./cronManager.js');
      const mgr = new CronManager();
      mgr.scheduleTask(makeTask({ id: 'task-1' }));
      mgr.scheduleTask(makeTask({ id: 'task-2' }));
      mgr.shutdown();

      expect(job1.stop).toHaveBeenCalledOnce();
      expect(job2.stop).toHaveBeenCalledOnce();
    });
  });
});
