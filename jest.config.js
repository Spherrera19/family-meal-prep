/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  moduleNameMapper: {
    // Resolve the @/ path alias defined in tsconfig.json
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Ensure these packages are transformed even though they live in node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      'react-native|' +
      '@react-native|' +
      '@react-native-community|' +
      'expo|' +
      '@expo|' +
      '@expo-google-fonts|' +
      'react-navigation|' +
      '@react-navigation|' +
      '@supabase|' +
      'native-base' +
    '))',
  ],
}
