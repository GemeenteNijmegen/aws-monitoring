import { stringMatchesPatternInArray } from '../index';

beforeAll(() => {
});

describe('Test patterns', () => {
  test('full strings', () => {
    const string = 'This should match the full string';
    const pattern = [
      'This should match the full string'
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });

  test('case insensitive strings', () => {
    const string = 'This should match the full string';
    const pattern = [
      'this should match the full string'
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });


  test('regex strings', () => {
    const string = 'This should match .*';
    const pattern = [
      'this should match the full string'
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });

});