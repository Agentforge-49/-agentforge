import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const apiUrl = 'http://127.0.0.1:3999'
const supabaseUrl = 'http://127.0.0.1:54321'

export default defineConfig({
  testDir:'./e2e',
  fullyParallel:false,
  workers:1,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI ? 1 : 0,
  reporter:process.env.CI ? [['line'], ['html', { open:'never' }]] : 'line',
  use:{
    baseURL:'http://127.0.0.1:4187',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
  },
  webServer:{
    command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4187',
    port:4187,
    reuseExistingServer:false,
    timeout:120000,
    env:{
      ...process.env,
      VITE_API_URL:apiUrl,
      VITE_SUPABASE_URL:supabaseUrl,
      VITE_SUPABASE_ANON_KEY:'public-e2e-anon-key',
    },
  },
  projects:[
    { name:'chromium', grepInvert:/@mobile/, use:{ ...devices['Desktop Chrome'], channel:'chrome' } },
    { name:'mobile-chrome', grep:/@mobile/, use:{ ...devices['Pixel 7'], channel:'chrome' } },
  ],
})
