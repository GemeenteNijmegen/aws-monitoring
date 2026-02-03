import { APIGatewayProxyEvent } from 'aws-lambda';
import { SlackbotHandler } from '../SlackbotHandler';

jest.mock('../slack-authenticate');

import { slackAuthenticate } from '../slack-authenticate';

const mockAuthenticate = slackAuthenticate as jest.MockedFunction<typeof slackAuthenticate>;
const mockSave = jest.fn();
const mockPostMessage = jest.fn();

describe('SlackbotHandler', () => {
  let handler: SlackbotHandler;
  let mockSlackClient: any;
  let mockRepository: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSlackClient = { postMessage: mockPostMessage };
    mockRepository = { save: mockSave };
    handler = new SlackbotHandler({
      slackSecret: 'test-secret',
      slackClient: mockSlackClient,
      trackedSlackMessagesRepository: mockRepository,
    });
  });

  test('handles event correctly', async () => {
    const event = {
      body: JSON.stringify(
        {
          "event": {
            "type": "app_mention",
            "user": "123123",
            "ts": "123123123.123123123",
            "client_msg_id": "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx",
            "text": "<@123123123> audit",
            "thread_ts": "123123123.123123",
            "blocks": [
              {
                "type": "rich_text",
                "block_id": "NcxSj",
                "elements": [
                  {
                    "type": "rich_text_section",
                    "elements": [
                      {
                        "type": "user",
                        "user_id": "U0ACJ7WMQN8"
                      },
                      {
                        "type": "text",
                        "text": " audit"
                      }
                    ]
                  }
                ]
              }
            ],
            "channel": "abcde",
            "event_ts": "123123123.123123"
          },
          "type": "event_callback",
          "event_id": "ABCDEF",
          "event_time": 123123123
        }
      ),
      headers: {},
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: {},
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(true);

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(200);
  });

  test('returns 403 when authentication fails', async () => {
    const event = {
      body: JSON.stringify({
        type: 'event_callback',
        event: { type: 'app_mention', text: 'audit', channel: 'C123', ts: '1234.5678' },
      }),
      headers: {},
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: {},
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(false);

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(403);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('skips retry messages from Slack', async () => {
    const event = {
      body: JSON.stringify({
        type: 'event_callback',
        event: { type: 'app_mention', text: 'audit', channel: 'C123', ts: '1234.5678' },
      }),
      headers: { 'X-Slack-Retry-Num': '1' },
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: { 'X-Slack-Retry-Num': ['1'] },
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(true);

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(200);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('processes valid app_mention event successfully', async () => {
    const event = {
      body: JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: 'audit this thread',
          channel: 'C123',
          ts: '1234.5678',
          client_msg_id: 'msg-123',
        },
      }),
      headers: {},
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: {},
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(true);
    mockSave.mockResolvedValue(undefined);
    mockPostMessage.mockResolvedValue(undefined);

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(200);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingGoal: 'audit',
        threadId: '1234.5678',
        channelId: 'C123',
      }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith('C123', '1234.5678', expect.anything());
  });

  test('sends error message when processing fails', async () => {
    const event = {
      body: JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: 'incident report',
          channel: 'C456',
          ts: '9876.5432',
          client_msg_id: 'msg-456',
        },
      }),
      headers: {},
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: {},
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(true);
    mockSave.mockRejectedValue(new Error('Database error'));

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(500);
    expect(mockPostMessage).toHaveBeenCalledWith('C456', '9876.5432', expect.anything());
  });

  test('returns 500 when error occurs without tracked message', async () => {
    const event = {
      body: JSON.stringify({
        type: 'event_callback',
        event: { type: 'app_mention' }, // Missing required fields
      }),
      headers: {},
      httpMethod: 'POST',
      path: '/slack/events',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      isBase64Encoded: false,
      multiValueHeaders: {},
    } as APIGatewayProxyEvent;

    mockAuthenticate.mockResolvedValue(true);

    const result = await handler.handleRequest(event);

    expect(result.statusCode).toBe(500);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
