import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  // Auto-imports are disabled on purpose: src/core/ must stay portable, and
  // explicit imports keep every file legible when read out of context.
  imports: false,
  manifest: {
    name: 'Verse',
    description: "Extract a YouTube transcript with timestamps, in the video's original language.",
    permissions: ['activeTab', 'clipboardWrite', 'storage', 'scripting'],
    host_permissions: ['*://*.youtube.com/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
