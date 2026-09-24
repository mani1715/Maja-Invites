// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
  enableVisualEdits: isDevServer, // Only enable during dev server
};

// Conditionally load visual edits modules only in dev mode
let setupDevServer;
let babelMetadataPlugin;

if (config.enableVisualEdits) {
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  eslint: {
    configure: {
      // "react-app" is the preset that carries `no-undef`. It is also mirrored
      // in package.json#eslintConfig, which is what `yarn lint` reads.
      //
      // ⚠️ CAVEAT — this block does NOT currently lint the build. CRA's
      // ESLintWebpackPlugin is present in the webpack plugin list and receives
      // this config as its baseConfig, but it never runs: no .eslintcache is
      // written and appending `const x = UNDEFINED_SYMBOL;` to a page still
      // reports "Compiled successfully" in both `craco start` and `craco build`.
      // The same config via the eslint CLI catches it immediately. Cause not
      // isolated (react-scripts 5 + craco 7 + eslint-webpack-plugin 3).
      // => Run `yarn lint` / `yarn lint:errors` to actually lint. That is the
      //    real gate; do not trust a green build to mean lint-clean.
      //
      // Two constraints, both load-bearing if the plugin is ever revived:
      //  1. eslint must be 8.x — react-scripts 5 / eslint-webpack-plugin 3
      //     cannot drive eslint 9 (pinned in devDependencies for this reason).
      //  2. do NOT also extend "plugin:react-hooks/recommended": this project
      //     has eslint-plugin-react-hooks hoisted at the top level AND
      //     eslint-config-react-app ships a nested copy, so extending both makes
      //     eslint throw "Cannot redefine plugin react-hooks". react-app already
      //     includes the react-hooks rules; the severities below just restate them.
      extends: ["react-app"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

// Only add babel metadata plugin during dev server
if (config.enableVisualEdits && babelMetadataPlugin) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

webpackConfig.devServer = (devServerConfig) => {
  // Apply visual edits dev server setup only if enabled
  if (config.enableVisualEdits && setupDevServer) {
    devServerConfig = setupDevServer(devServerConfig);
  }

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  // Proxy API + uploaded media to the FastAPI backend so the browser talks to
  // the app same-origin (no REACT_APP_BACKEND_URL / CORS needed, and the
  // HttpOnly refresh cookie works). Backend port overridable via BACKEND_PORT.
  const backendTarget = `http://localhost:${process.env.BACKEND_PORT || 8000}`;
  devServerConfig.proxy = {
    '/api': { target: backendTarget, changeOrigin: true, ws: true },
    '/uploads': { target: backendTarget, changeOrigin: true },
  };

  return devServerConfig;
};

module.exports = webpackConfig;
