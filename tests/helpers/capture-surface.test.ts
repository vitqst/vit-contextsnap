import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForCaptureSurface } from './capture-surface';

const unavailable = () =>
  new Error(
    'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot',
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('native capture surface readiness', () => {
  it('never passes zero at the deadline boundary, because zero disables Playwright timeouts', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(4_999).mockReturnValue(5_000);
    const budgets: number[] = [];
    await waitForCaptureSurface(async (timeout) => {
      budgets.push(timeout);
    });
    expect(budgets).toEqual([1]);
  });
  it('continues immediately when compositor readback is available', async () => {
    let attempts = 0;
    await waitForCaptureSurface(async () => {
      attempts++;
      return new Uint8Array([1]);
    });
    expect(attempts).toBe(1);
    expect(Date.now()).toBe(0);
  });

  it('waits through transient readback failures without sending or repeating a capture action', async () => {
    let attempts = 0;
    const pending = waitForCaptureSurface(async () => {
      if (++attempts < 3) throw unavailable();
      return new Uint8Array([1]);
    });
    const assertion = expect(pending).resolves.toBeUndefined();
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(1_000)]);
    expect(attempts).toBe(3);
  });

  it('fails at a bounded deadline and retains the original readback error', async () => {
    const cause = unavailable();
    let attempts = 0;
    const pending = waitForCaptureSurface(async () => {
      attempts++;
      throw cause;
    });
    const assertion = expect(pending).rejects.toMatchObject({
      message: expect.stringContaining('5 seconds'),
      cause,
    });
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(5_100)]);
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(51);
  });

  it.each([
    'Target page, context or browser has been closed',
    'Timeout 1000ms exceeded',
    'Permission denied',
  ])('does not hide unrelated browser errors: %s', async (message) => {
    const cause = new Error(message);
    let attempts = 0;
    await expect(
      waitForCaptureSurface(async () => {
        attempts++;
        throw cause;
      }),
    ).rejects.toBe(cause);
    expect(attempts).toBe(1);
  });

  it('passes only the remaining time budget to each readback', async () => {
    const budgets: number[] = [];
    const pending = waitForCaptureSurface(async (timeout) => {
      budgets.push(timeout);
      await new Promise((resolve) => setTimeout(resolve, 900));
      throw unavailable();
    });
    const assertion = expect(pending).rejects.toThrow('5 seconds');
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(5_100)]);
    expect(budgets[0]).toBe(5_000);
    expect(budgets.at(-1)).toBe(1_000);
  });
});
