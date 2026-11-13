import { createHmac } from 'crypto';
import { slackAuthenticate } from '../slack-authenticate';

const SECRET = 'signing-secret';
const NOW = 1_700_000_000;
const sign = (ts: string, body: string) => 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
const makeEvent = (headers: Record<string, string>, body = 'payload=x') => ({ body, headers } as any);

beforeEach(() => { jest.useFakeTimers({ doNotFake: ['performance'] }); jest.setSystemTime(NOW * 1000); });
afterEach(() => jest.useRealTimers());

test('accepts a valid request', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }), SECRET)).toBe(true);
});
test('accepts lowercase header names', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'x-slack-request-timestamp': ts, 'x-slack-signature': sign(ts, 'payload=x') }), SECRET)).toBe(true);
});
test('rejects a tampered body', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }, 'payload=y'), SECRET)).toBe(false);
});
test.each([['expired', `${NOW - 61}`], ['future', `${NOW + 61}`], ['missing', ''], ['non-numeric', 'abc']])('rejects %s timestamp', async (_n, ts) => {
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, 'payload=x') }), SECRET)).toBe(false);
});
test('rejects a signature of different length without throwing', async () => {
  const ts = `${NOW}`;
  expect(await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': 'v0=abc' }), SECRET)).toBe(false);
});
test('never logs signatures', async () => {
  const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'debug')].map(s => s.mockImplementation());
  const ts = `${NOW}`; const sig = sign(ts, 'payload=x');
  await slackAuthenticate(makeEvent({ 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sig }), SECRET);
  spies.forEach(s => s.mock.calls.forEach(c => expect(JSON.stringify(c)).not.toContain(sig)));
});
