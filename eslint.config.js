import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', '*.config.js'],
  },
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    files: ['src/main/**/*.js'],
    languageOptions: {
      globals: {
        // Node.js/Electron main process globals
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
  },
  {
    files: ['src/preload/**/*.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['src/renderer/**/*.{js,vue}'],
    languageOptions: {
      globals: {
        // Browser/renderer process globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Element: 'readonly',
        SVGElement: 'readonly',
        MathMLElement: 'readonly',
        self: 'readonly',
      },
    },
  },
];
