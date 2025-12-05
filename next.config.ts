import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Handle ESM modules properly
  transpilePackages: [
    "@reown/appkit",
    "@reown/appkit-adapter-wagmi",
    "@walletconnect/universal-provider",
    "@walletconnect/utils",
    "@walletconnect/logger",
  ],
  // Externalize problematic packages on server
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
  // Configure Turbopack
  turbopack: {},
  // Configure webpack for the build
  webpack: (config) => {
    // Handle missing optional dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      // Stub out optional wallet connectors that aren't installed
      porto: false,
      "porto/internal": false,
      "@gemini-wallet/core": false,
      // React Native modules not needed for web
      "@react-native-async-storage/async-storage": false,
      // Solana modules not needed (from Coinbase SDK)
      "@solana/kit": false,
      "@solana/web3.js": false,
      "@solana-program/system": false,
      "@solana-program/token": false,
      "@coinbase/cdp-sdk": false,
      "@base-org/account": false,
    };
    
    // Add fallback for node modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
};

export default nextConfig;
