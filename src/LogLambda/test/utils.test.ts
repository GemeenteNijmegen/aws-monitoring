import { stringMatchesPatternInArray } from '../index';

beforeAll(() => {
});

describe('Test patterns', () => {
  test('full strings', () => {
    const string = 'This should match the full string';
    const pattern = [
      'This should match the full string',
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });

  test('case insensitive strings', () => {
    const string = 'This should match the full string';
    const pattern = [
      'this should match the full string',
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });


  test('regex strings', () => {
    const string = 'This should match the full string';
    const pattern = [
      'This should match .*',
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });

  test('strings with special chars', () => {
    const string = 'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/AWS/ApplicationELB/TargetResponseTime/app/Produ-loadb-1X';
    const pattern = [
      'ApplicationInsights/ApplicationInsights-ContainerInsights-ECS_CLUSTER-eform-cluster/AWS/ApplicationELB/TargetResponseTime.*',
    ];
    expect(stringMatchesPatternInArray(pattern, string)).toBe(true);
  });

});