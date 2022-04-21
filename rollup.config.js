import pluginTypescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.mjs',
    format: 'es',
  },
  plugins: [
    pluginTypescript(),
  ],
  external: ['@actions/core', '@actions/github/lib/context', '@technote-space/github-action-helper', '@technote-space/github-action-log-helper', '@technote-space/filter-github-action', 'moment'],
};
