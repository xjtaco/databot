export default {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-recess-order',
  ],
  ignoreFiles: ['dist/**'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
      rules: {
        // postcss-html does not mark inline style attributes as inline context,
        // so this rule incorrectly flags valid declarations in template style="" attributes.
        'no-invalid-position-declaration': null,
      },
    },
  ],
  rules: {
    // Allow Vue scoped pseudo-classes
    // Currently only :deep() is used; :slotted() and :global() whitelisted for future use
    'selector-pseudo-class-no-unknown': [true, {
      ignorePseudoClasses: ['deep', 'slotted', 'global'],
    }],

    // Disable class pattern — BEM + Element Plus classes coexist
    'selector-class-pattern': null,
  },
};
