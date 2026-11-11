import {
  buildSuppressView,
  decodeButtonValue,
  MAX_REASON_LENGTH,
  SUPPRESS_CALLBACK_ID,
  SuppressMetadata,
} from '../ActionPayload';
import { SlackApi } from '../SlackApi';

function mockFetch(body: any, init: { ok?: boolean; status?: number } = {}) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'status',
    json: async () => body,
  } as any);
}

describe('SlackApi', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('openModal posts JSON to views.open with bearer token', async () => {
    const spy = mockFetch({ ok: true });
    await new SlackApi('xoxb-token').openModal('T1', { type: 'modal' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toBe('https://slack.com/api/views.open');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer xoxb-token');
    expect(JSON.parse(init.body)).toEqual({ trigger_id: 'T1', view: { type: 'modal' } });
  });

  test('openModal throws when Slack returns ok false', async () => {
    mockFetch({ ok: false, error: 'expired_trigger_id' });
    await expect(new SlackApi('t').openModal('T1', {})).rejects.toThrow('Slack views.open failed: expired_trigger_id');
  });

  test('listGroupMembers returns users', async () => {
    const spy = mockFetch({ ok: true, users: ['U1', 'U2'] });
    const users = await new SlackApi('tok').listGroupMembers('S1');

    expect(users).toEqual(['U1', 'U2']);
    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toBe('https://slack.com/api/usergroups.users.list?usergroup=S1');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  test('listGroupMembers throws on ok false', async () => {
    mockFetch({ ok: false, error: 'no_such_subteam' });
    await expect(new SlackApi('t').listGroupMembers('S1')).rejects.toThrow('Slack usergroups.users.list failed: no_such_subteam');
  });

  test('throws on non-2xx response', async () => {
    mockFetch({}, { ok: false, status: 500 });
    await expect(new SlackApi('t').openModal('T1', {})).rejects.toThrow('Slack views.open failed: HTTP 500');
  });

  test('respond posts JSON to the response url', async () => {
    const spy = mockFetch({});
    await SlackApi.respond('https://hooks.slack.com/actions/abc', { text: 'done' });

    const [url, init] = spy.mock.calls[0] as [string, any];
    expect(url).toBe('https://hooks.slack.com/actions/abc');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ text: 'done' });
  });

  test('respond throws on non-2xx without leaking the url', async () => {
    mockFetch({}, { ok: false, status: 404 });
    await expect(SlackApi.respond('https://hooks.slack.com/actions/secret', {})).rejects.toThrow(/^Slack response_url failed: HTTP 404$/);
  });
});

describe('ActionPayload', () => {
  test('decodeButtonValue round-trips the button value', () => {
    const value = Buffer.from(JSON.stringify({ id: 'f1', productArn: 'arn:p' })).toString('base64');
    expect(decodeButtonValue(value)).toEqual({ id: 'f1', productArn: 'arn:p' });
  });

  test('decodeButtonValue throws on garbage', () => {
    expect(() => decodeButtonValue('!!!not-base64-json')).toThrow();
  });

  test('decodeButtonValue throws on missing fields', () => {
    const value = Buffer.from(JSON.stringify({ id: 'f1' })).toString('base64');
    expect(() => decodeButtonValue(value)).toThrow();
  });

  test('buildSuppressView has max_length and metadata round-trips', () => {
    const meta: SuppressMetadata = { id: 'f1', productArn: 'arn:p', responseUrl: 'https://r' };
    const view: any = buildSuppressView(meta);

    expect(view.callback_id).toBe(SUPPRESS_CALLBACK_ID);
    expect(view.title.text).toBe('Suppress finding');
    expect(view.submit.text).toBe('Suppress');
    expect(JSON.parse(view.private_metadata)).toEqual(meta);
    const element = view.blocks[0].element;
    expect(view.blocks).toHaveLength(1);
    expect(element.type).toBe('plain_text_input');
    expect(element.multiline).toBe(true);
    expect(element.max_length).toBe(MAX_REASON_LENGTH);
    expect(MAX_REASON_LENGTH).toBe(400);
  });
});
