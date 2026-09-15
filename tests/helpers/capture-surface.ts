/** Readback must succeed before sending the native extension shortcut. */
export async function waitForCaptureSurface(
  readback: (timeout: number) => Promise<unknown>,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (true) {
    const budget = deadline - Date.now();
    if (budget <= 0) break;
    try {
      await readback(budget);
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes(
          'Protocol error (Page.captureScreenshot): Unable to capture screenshot',
        )
      )
        throw error;
      lastError = error;
    }
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
  }
  throw new Error('Chrome capture surface was not readable within 5 seconds.', {
    cause: lastError,
  });
}
