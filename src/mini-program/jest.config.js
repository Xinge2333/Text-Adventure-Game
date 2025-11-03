module.exports = {
  testMatch: ['<rootDir>/pages/**/__tests__/**/*.test.js'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  transform: {
    '^.+\\.js$': ['babel-jest', { presets: ['@babel/preset-env'] }]
  },
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '^\.\./\.\./utils/(.*)$': '<rootDir>/utils/$1'
  }
};
