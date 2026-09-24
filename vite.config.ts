import { defineConfig } from 'vite'

// `npm run dev:device` turns off hot reload so code edits on the Mac do not
// silently restart the app on the phone during a hardware test.
const noHmr = process.env.NO_HMR === '1'

export default defineConfig({
  server: { host: true, port: 5180, strictPort: true, hmr: !noHmr, watch: noHmr ? null : undefined },
  build: { target: 'esnext' },
})
