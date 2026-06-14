// jest.setup.js
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = function(...args) {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning:') ||
        args[0].includes('Cannot find module'))
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  console.warn = function(...args) {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning:')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});