import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'ContextSnap — Screenshot & Draw',
    description:
      'Capture a page, point out the details, and copy a polished screenshot. Everything stays local.',
    minimum_chrome_version: '120',
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite', 'contextMenus'],
    action: { default_title: 'ContextSnap' },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+S' } },
      'capture-area': {
        suggested_key: { default: 'Ctrl+Shift+1', mac: 'Command+Shift+1' },
        description: 'Capture a selected area',
      },
      'capture-visible': {
        suggested_key: { default: 'Alt+Shift+V' },
        description: 'Capture the visible page',
      },
    },
  },
  vite: () => ({ build: { sourcemap: false } }),
});
