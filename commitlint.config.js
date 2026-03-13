/**
 * 与 .cursor/rules/git-commit-message.mdc 保持一致：
 * 格式 <type>: <中文描述>，type 小写英文，描述使用中文。
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
        'revert',
        'ci',
        'build',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [0],
    'header-max-length': [2, 'always', 100],
  },
};
