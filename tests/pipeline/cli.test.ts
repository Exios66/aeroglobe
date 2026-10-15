// @vitest-environment node
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDay } from '../../pipeline/build';
import { runCli } from '../../pipeline/cli';
import { checkDataDir, publishDataDir, pullDataBranch } from '../../pipeline/publish';
import { adsblolSource } from '../../pipeline/sources/adsblol';
import type { TraceSource } from '../../pipeline/sources/types';
import { downloadTimezones } from '../../pipeline/tzDownload';

vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof import('node:fs/promises')>(),
  rm: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../pipeline/build', () => ({ buildDay: vi.fn() }));
vi.mock('../../pipeline/publish', () => ({ checkDataDir: vi.fn(), publishDataDir: vi.fn(), pullDataBranch: vi.fn() }));
vi.mock('../../pipeline/sources/adsblol', () => ({ adsblolSource: vi.fn() }));
vi.mock('../../pipeline/tzDownload', () => ({ downloadTimezones: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DATA_DAYS', undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('new pipeline commands', () => {
  it.each([
    ['pull', '--into <dir> is required'],
    ['publish', '--from <dir> is required'],
    ['check', '--dir <dir> is required'],
  ])('requires the directory argument for %s before doing any work', async (command, message) => {
    await expect(runCli([command])).rejects.toThrow(message);
    expect(pullDataBranch).not.toHaveBeenCalled();
    expect(publishDataDir).not.toHaveBeenCalled();
    expect(checkDataDir).not.toHaveBeenCalled();
  });

  it.each(['cloned', 'empty'] as const)('reports the %s pull result', async (result) => {
    vi.mocked(pullDataBranch).mockResolvedValue(result);
    await runCli(['pull', '--into', 'restored data']);
    expect(pullDataBranch).toHaveBeenCalledExactlyOnceWith({ repoDir: process.cwd(), into: 'restored data' });
    expect(console.log).toHaveBeenCalledWith(result === 'cloned'
      ? 'restored data branch into restored data'
      : 'no data branch yet; created empty restored data');
  });

  it.each([false, true])('passes dryRun=%s to publishing', async (dryRun) => {
    vi.mocked(publishDataDir).mockResolvedValue({ commit: 'abc123' });
    await runCli(['publish', '--from', 'data-out', ...(dryRun ? ['--dry-run'] : [])]);
    expect(publishDataDir).toHaveBeenCalledExactlyOnceWith({ repoDir: process.cwd(), from: 'data-out', dryRun });
    expect(console.log).toHaveBeenCalledWith(dryRun ? 'dry run: would publish commit abc123' : 'published commit abc123');
  });

  it.each([undefined, 'custom/timezones.geojson'])('downloads timezones to %s', async (out) => {
    const target = out ?? 'pipeline/inputs/cache/timezones.geojson';
    vi.mocked(downloadTimezones).mockResolvedValue(target);
    await runCli(['tz-download', ...(out ? ['--out', out] : [])]);
    expect(downloadTimezones).toHaveBeenCalledExactlyOnceWith(target);
    expect(console.log).toHaveBeenCalledWith(`wrote ${target}`);
  });

  it('reports validation totals', async () => {
    vi.mocked(checkDataDir).mockResolvedValue({ ok: true, problems: [], days: 2, files: 52, totalBytes: 1234 });
    await runCli(['check', '--dir', 'data-out']);
    expect(checkDataDir).toHaveBeenCalledExactlyOnceWith('data-out');
    expect(console.log).toHaveBeenCalledWith('ok: 2 day(s), 52 files, 1234 bytes');
  });

  it('includes every validation problem in the rejection', async () => {
    vi.mocked(checkDataDir).mockResolvedValue({ ok: false, problems: ['missing catalog', 'missing airports'], days: 0, files: 0, totalBytes: 0 });
    await expect(runCli(['check', '--dir', 'data-out'])).rejects.toThrow('2 problem(s):\nmissing catalog\nmissing airports');
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(['pull', 'publish', 'tz-download', 'check'])('propagates a %s failure without reporting success', async (command) => {
    const error = new Error('offline');
    vi.mocked(pullDataBranch).mockRejectedValue(error);
    vi.mocked(publishDataDir).mockRejectedValue(error);
    vi.mocked(downloadTimezones).mockRejectedValue(error);
    vi.mocked(checkDataDir).mockRejectedValue(error);
    const args: Record<string, string[]> = { pull: ['--into', 'data'], publish: ['--from', 'data'], check: ['--dir', 'data'], 'tz-download': [] };
    await expect(runCli([command, ...args[command]])).rejects.toBe(error);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('lists the new commands in usage for an unknown command', async () => {
    await expect(runCli(['unknown'])).rejects.toThrow('build|fixture|inputs|snapshot|pull|publish|tz-download|check');
  });
});

describe('adsblol build CLI', () => {
  const date = '2026-10-12';
  const args = ['build', '--date', date, '--source', 'adsblol', '--out', 'data-out'];
  const source: TraceSource = { name: 'adsblol', attribution: 'test', traces: vi.fn() };

  beforeEach(() => {
    vi.mocked(adsblolSource).mockReturnValue(source);
  });

  it('passes build options and removes a custom work directory after success', async () => {
    await runCli([...args, '--work-dir', 'downloads with spaces', '--window', '7', '--tz', 'tz.geojson', '--featured']);
    expect(adsblolSource).toHaveBeenCalledExactlyOnceWith('downloads with spaces');
    expect(buildDay).toHaveBeenCalledExactlyOnceWith({ date, source, outDir: 'data-out', now: expect.any(Date), window: 7, maxBytesGz: 2_000_000, featured: true, tzInput: 'tz.geojson', refInputsDir: 'pipeline/inputs' });
    expect(rm).toHaveBeenCalledExactlyOnceWith('downloads with spaces', { recursive: true, force: true });
    expect(vi.mocked(buildDay).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(rm).mock.invocationCallOrder[0]);
  });

  it('uses a date-specific temp directory and the DATA_DAYS setting by default', async () => {
    vi.stubEnv('DATA_DAYS', '5');
    await runCli(args);
    const workDir = join(tmpdir(), `adsblol-${date}`);
    expect(adsblolSource).toHaveBeenCalledWith(workDir);
    expect(buildDay).toHaveBeenCalledWith(expect.objectContaining({ window: 5, featured: false }));
    expect(rm).toHaveBeenCalledWith(workDir, { recursive: true, force: true });
  });

  it('keeps downloads on failure and rethrows the original build error', async () => {
    const error = new Error('hour exceeds budget');
    vi.mocked(buildDay).mockRejectedValue(error);
    await expect(runCli([...args, '--work-dir', 'resume-here'])).rejects.toBe(error);
    expect(rm).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('kept downloads in resume-here; re-run to resume');
  });

  it('rejects an invalid window before creating a source or cleaning downloads', async () => {
    await expect(runCli([...args, '--window', '0'])).rejects.toThrow('integer >= 1');
    expect(adsblolSource).not.toHaveBeenCalled();
    expect(buildDay).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });
});
