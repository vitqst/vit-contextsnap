import { copyImage, downloadImage } from '../export/image';
import type { EditorPlatform } from './editor-platform';
import { returnToWebsite } from './source-navigation';
import { saveRecent } from './storage';

export const chromeEditorPlatform: EditorPlatform = {
  async loadDrawingStyle() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
    return (await chrome.storage.local.get('drawingStyle')).drawingStyle;
  },
  async saveDrawingStyle(style) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ drawingStyle: style });
  },
  copyImage,
  async saveImage(png, filename) {
    downloadImage(png, filename);
    return true;
  },
  async confirmReplace() {
    return window.confirm(
      'Replace this screenshot? Copy or download it first if you want to keep your current work.',
    );
  },
  saveLabel: 'Download PNG',
  saveSuccessMessage: 'PNG downloaded.',
  returnToWebsite,
  saveRecent,
};
