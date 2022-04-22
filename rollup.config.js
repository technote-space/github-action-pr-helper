import pluginTypescript from '@rollup/plugin-typescript';

const common = {
  input: 'src/index.ts',
  plugins: [
    pluginTypescript(),
  ],
  external: ['@actions/core', '@actions/github/lib/context', '@technote-space/github-action-helper', '@technote-space/github-action-log-helper', '@technote-space/filter-github-action', 'moment'],
};

export default [
  {
    ...common,
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
    },
  },
  {
    ...common,
    output: {
      file: 'dist/index.mjs',
      format: 'es',
    },
  },
];
