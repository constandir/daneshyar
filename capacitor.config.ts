import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.daneshyar.uni',
  appName: 'دانشیار',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#4f46e5' },
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    CapacitorSQLite: { androidIsEncryption: false },
  },
};

export default config;
