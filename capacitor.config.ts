import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.costeapro.pos",
  appName: "Costea POS",
  webDir: ".output/public",
  loggingBehavior: "none",
  server: {
    url: "https://costea-pos-master.lovable.app",
    cleartext: false,
  },
  android: {
    path: "mobile/android",
  },
};

export default config;
