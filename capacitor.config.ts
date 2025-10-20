import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ahirbook.app',
  appName: 'Ahir Book',
  webDir: 'dist',
  server: {
    // Force root path for native apps (don't use /ahir-book/)
    androidScheme: 'https',
    iosScheme: 'capacitor',
    hostname: 'app.ahirbook.local'
  }
};

export default config;
