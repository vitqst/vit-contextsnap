/** Return a safe, canonical website URL without fetching or changing stored metadata. */
export function sourceWebsiteUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 16_384 || !/^https?:\/\//i.test(value)) {
    return null;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isClosedTabError(error: unknown): boolean {
  return error instanceof Error && /No tab with id:|Invalid tab ID:/i.test(error.message);
}

/** Chrome owns the live opener relationship; never persist or reuse a historical tab ID. */
export async function returnToWebsite(source: {
  url: string;
  allowCaptureOpener: boolean;
}): Promise<void> {
  const url = sourceWebsiteUrl(source.url);
  if (!url) throw new Error('This image has no valid website URL to return to.');

  const editor = await chrome.tabs.getCurrent();
  let target: chrome.tabs.Tab | undefined;
  if (source.allowCaptureOpener && editor?.openerTabId !== undefined) {
    try {
      const opener = await chrome.tabs.get(editor.openerTabId);
      if (
        sourceWebsiteUrl(opener.url) === url &&
        (opener.pendingUrl === undefined || sourceWebsiteUrl(opener.pendingUrl) === url)
      ) {
        target = (await chrome.tabs.update(editor.openerTabId, { active: true })) ?? opener;
      }
    } catch (error) {
      // A closed source is expected; other API failures must not create duplicate tabs.
      if (!isClosedTabError(error)) throw error;
    }
  }

  if (!target) {
    target = await chrome.tabs.create({
      url,
      active: true,
      ...(editor ? { windowId: editor.windowId } : {}),
    });
  }
  await chrome.windows.update(target.windowId, { focused: true });
}
