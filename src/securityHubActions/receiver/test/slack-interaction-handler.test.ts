import { createHmac } from 'crypto';
import { MAX_REASON_LENGTH, REASON_ACTION_ID, REASON_BLOCK_ID, SUPPRESS_ACTION_ID, SUPPRESS_CALLBACK_ID } from '../../shared/ActionPayload';
import { handleSlackInteraction, ReceiverDeps } from '../SlackInteractionHandler';

const SECRET = 'signing-secret';
const NOW = 1_700_000_000;
const FINDING = { id: 'finding-1', productArn: 'arn:aws:securityhub:eu-west-1::product/aws/guardduty' };
const RESPONSE_URL = 'https://hooks.slack.com/actions/T/B/secret';
const TRIGGER_ID = 'trigger-secret';

const sign = (ts: string, body: string) => 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
const signedEvent = (body: string) => {
  const ts = `${NOW}`;
  return { body, headers: { 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sign(ts, body) } } as any;
};
const payloadEvent = (payload: object) => signedEvent(new URLSearchParams({ payload: JSON.stringify(payload) }).toString());
const buttonValue = (v: object = FINDING) => Buffer.from(JSON.stringify(v)).toString('base64');

const clickPayload = (overrides: any = {}) => ({
  type: 'block_actions',
  user: { id: 'U123' },
  trigger_id: TRIGGER_ID,
  response_url: RESPONSE_URL,
  actions: [{ action_id: SUPPRESS_ACTION_ID, value: buttonValue() }],
  ...overrides,
});
const submitPayload = (reason: string, overrides: any = {}) => ({
  type: 'view_submission',
  user: { id: 'U123' },
  view: {
    callback_id: SUPPRESS_CALLBACK_ID,
    private_metadata: JSON.stringify({ ...FINDING, responseUrl: RESPONSE_URL }),
    state: { values: { [REASON_BLOCK_ID]: { [REASON_ACTION_ID]: { type: 'plain_text_input', value: reason } } } },
  },
  ...overrides,
});

let deps: ReceiverDeps;
let openModal: jest.Mock;
let enqueue: jest.Mock;
let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(NOW * 1000);
  openModal = jest.fn().mockResolvedValue(undefined);
  enqueue = jest.fn().mockResolvedValue(undefined);
  logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  deps = { signingSecret: SECRET, slack: { openModal }, enqueue, logger };
});
afterEach(() => jest.useRealTimers());

const expectNothingDone = () => {
  expect(openModal).not.toHaveBeenCalled();
  expect(enqueue).not.toHaveBeenCalled();
};

describe('authentication', () => {
  test('rejects unsigned request', async () => {
    const body = new URLSearchParams({ payload: JSON.stringify(clickPayload()) }).toString();
    const result = await handleSlackInteraction({ body, headers: {} } as any, deps);
    expect(result.statusCode).toBe(403);
    expect(result.body).toBe('');
    expectNothingDone();
  });

  test('rejects invalid signature', async () => {
    const event = payloadEvent(clickPayload());
    event.headers['X-Slack-Signature'] = 'v0=' + '0'.repeat(64);
    const result = await handleSlackInteraction(event, deps);
    expect(result.statusCode).toBe(403);
    expectNothingDone();
  });
});

describe('malformed bodies', () => {
  test.each([
    ['empty body', ''],
    ['non-form body', 'not a form body'],
    ['bad JSON', 'payload=' + encodeURIComponent('{nope')],
    ['no payload key', 'other=1'],
    ['JSON that is not an object', 'payload=' + encodeURIComponent('"text"')],
  ])('rejects malformed body: %s', async (_n, body) => {
    const result = await handleSlackInteraction(signedEvent(body), deps);
    expect(result.statusCode).toBe(400);
    expectNothingDone();
  });
});

describe('block_actions', () => {
  test('opens modal on click', async () => {
    const result = await handleSlackInteraction(payloadEvent(clickPayload()), deps);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expect(openModal).toHaveBeenCalledTimes(1);
    const [triggerId, view] = openModal.mock.calls[0];
    expect(triggerId).toBe(TRIGGER_ID);
    expect(JSON.parse(view.private_metadata)).toEqual({ ...FINDING, responseUrl: RESPONSE_URL });
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('ignores other actions', async () => {
    const result = await handleSlackInteraction(payloadEvent(clickPayload({ actions: [{ action_id: 'something_else', value: 'x' }] })), deps);
    expect(result.statusCode).toBe(200);
    expectNothingDone();
  });

  test('ignores undecodable button value', async () => {
    const badValue = 'bad-button-value-secret';
    const result = await handleSlackInteraction(payloadEvent(clickPayload({ actions: [{ action_id: SUPPRESS_ACTION_ID, value: badValue }] })), deps);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expectNothingDone();
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(badValue);
  });

  test('logs openModal failure and returns 200', async () => {
    openModal.mockRejectedValue(new Error('views.open failed'));
    const result = await handleSlackInteraction(payloadEvent(clickPayload()), deps);
    expect(result.statusCode).toBe(200);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('unknown payload types', () => {
  test('ignores unknown type', async () => {
    const result = await handleSlackInteraction(payloadEvent({ type: 'shortcut', user: { id: 'U1' } }), deps);
    expect(result.statusCode).toBe(200);
    expectNothingDone();
  });
});

describe('view_submission', () => {
  test('enqueues on submit', async () => {
    const result = await handleSlackInteraction(payloadEvent(submitPayload('  false positive  ')), deps);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ ...FINDING, responseUrl: RESPONSE_URL, slackUserId: 'U123', reason: 'false positive' });
  });

  test('ignores submissions for other callback ids', async () => {
    const payload = submitPayload('reason');
    payload.view.callback_id = 'other';
    const result = await handleSlackInteraction(payloadEvent(payload), deps);
    expect(result.statusCode).toBe(200);
    expectNothingDone();
  });

  test('rejects submission with invalid metadata', async () => {
    const payload = submitPayload('reason');
    payload.view.private_metadata = 'not json';
    const result = await handleSlackInteraction(payloadEvent(payload), deps);
    expect(result.statusCode).toBe(400);
    expectNothingDone();
  });

  test.each([
    ['empty', ''],
    ['whitespace', '   \n '],
    ['too long', 'a'.repeat(MAX_REASON_LENGTH + 1)],
  ])('rejects invalid reason: %s', async (_n, reason) => {
    const result = await handleSlackInteraction(payloadEvent(submitPayload(reason)), deps);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response_action).toBe('errors');
    expect(typeof body.errors.reason).toBe('string');
    expect(body.errors.reason.length).toBeGreaterThan(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('missing reason value is rejected as invalid reason', async () => {
    const payload = submitPayload('x');
    payload.view.state = { values: {} } as any;
    const result = await handleSlackInteraction(payloadEvent(payload), deps);
    expect(JSON.parse(result.body).response_action).toBe('errors');
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('accepts a reason of exactly the maximum length', async () => {
    const result = await handleSlackInteraction(payloadEvent(submitPayload('a'.repeat(MAX_REASON_LENGTH))), deps);
    expect(result.body).toBe('');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  test('enqueue failure returns errors response', async () => {
    enqueue.mockRejectedValue(new Error('sqs down'));
    const result = await handleSlackInteraction(payloadEvent(submitPayload('reason')), deps);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).response_action).toBe('errors');
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('logging', () => {
  test('never logs secrets from the request', async () => {
    await handleSlackInteraction(payloadEvent(clickPayload()), deps);
    await handleSlackInteraction(payloadEvent(submitPayload('my private reason')), deps);
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    for (const secret of [RESPONSE_URL, TRIGGER_ID, 'v0=', 'my private reason']) {
      expect(logged).not.toContain(secret);
    }
  });
});
