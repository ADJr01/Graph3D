export default [
  {
    files: ['src/**/*.js'],
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // GraphDevTools (Prompt 178) is a console-output debugging surface by
    // design — dumpSceneGraph/listActiveTimelines/etc. exist specifically to
    // print to the console, and it's gated out of production builds
    // (Graph3D.devtools throws when process.env.NODE_ENV === 'production'),
    // so this never ships `console.log`/`console.table` calls to real users.
    files: ['src/core/GraphDevTools.js'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'log', 'table'] }],
    },
  },
];
