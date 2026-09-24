import base from '@peladafc/config/eslint';

export default [
  ...base,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
