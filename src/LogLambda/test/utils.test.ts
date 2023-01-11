import { getAccount } from '../utils';
import { SlackMessage } from '../SlackMessage';
import { stringMatchesPatternInArray } from '../SnsEventHandler';

beforeAll(() => {
  process.env.ACCOUNT_NAME = 'test-account-name';
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


describe('SlackMessage', () => {

  test('header', () => {
    const m = new SlackMessage();
    m.addHeader('✅ Test');
    const message = m.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('✅ Test');
  });

  test('link', () => {
    const m = new SlackMessage();
    m.addLink('test', 'target');
    const message = m.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('<test|target>');
  });

  test('context', () => {
    const m = new SlackMessage();
    m.addContext({
      type: 'test',
      account: '123',
    });
    const message = m.getSlackMessage();
    expect(message.blocks[0].elements[0].text).toBe('type: *test*');
    expect(message.blocks[0].elements[1].text).toBe('account: *123*');
  });

  test('section', () => {
    const m = new SlackMessage();
    m.addSection('body');
    const message = m.getSlackMessage();
    expect(message.blocks[0].text.text).toBe('body');
  });

});

test('get account name', () => {
  expect(getAccount()).toBe('test-account-name');
});