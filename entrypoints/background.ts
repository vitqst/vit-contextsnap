import { defineBackground } from 'wxt/utils/define-background';
import {
  cancelAreaCapture,
  captureFailureMessage,
  confirmAreaCapture,
  forgetAreaSession,
  isAreaCaptureRequest,
  isCaptureRequest,
  isExtensionPageSender,
  startCapture,
} from '../src/platform/capture';
import type { CaptureReply } from '../src/platform/types';

async function runCapture(action: () => Promise<void>): Promise<CaptureReply> {
  try {
    await action();
    await chrome.storage.session.remove(['lastCaptureError', 'lastCaptureErrorAt']);
    await chrome.action.setBadgeText({ text: '' });
    return { ok: true };
  } catch (error) {
    const message = captureFailureMessage(error);
    await chrome.storage.session.set({ lastCaptureError: message, lastCaptureErrorAt: Date.now() });
    await chrome.action.setBadgeBackgroundColor({ color: '#c94b4b' });
    await chrome.action.setBadgeText({ text: '!' });
    return { ok: false, error: message };
  }
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'contextsnap',
        title: 'ContextSnap',
        contexts: ['page', 'image', 'selection', 'link'],
      });
      chrome.contextMenus.create({
        id: 'capture-visible',
        parentId: 'contextsnap',
        title: 'Capture visible page',
        contexts: ['all'],
      });
      chrome.contextMenus.create({
        id: 'capture-area',
        parentId: 'contextsnap',
        title: 'Capture selected area',
        contexts: ['all'],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'capture-visible' || info.menuItemId === 'capture-area') {
      void runCapture(() =>
        startCapture(info.menuItemId === 'capture-area' ? 'area' : 'visible', tab?.id),
      );
    }
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'capture-visible' || command === 'capture-area') {
      void runCapture(() => startCapture(command === 'capture-area' ? 'area' : 'visible', tab?.id));
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void forgetAreaSession(tabId);
  });

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (reply: CaptureReply) => void) => {
      if (isCaptureRequest(message)) {
        if (!isExtensionPageSender(sender)) {
          sendResponse({
            ok: false,
            error: 'Start a capture using the ContextSnap toolbar or shortcut.',
          });
          return false;
        }
        void runCapture(() => startCapture(message.mode, message.tabId)).then(sendResponse);
        return true;
      }
      if (isAreaCaptureRequest(message)) {
        void runCapture(() => confirmAreaCapture(message, sender)).then(sendResponse);
        return true;
      }
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'capture-area-cancel'
      ) {
        void cancelAreaCapture(sender).then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false }),
        );
        return true;
      }
      sendResponse({ ok: false, error: 'Unsupported capture request.' });
      return false;
    },
  );
});
