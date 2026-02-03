import { TrackedSlackMessage } from '../../shared/models/TrackedSlackMessage';
import { ArchiverService, SUCCESS_TEXT } from '../ArchiverService';
import { SlackUser } from '../models/ArchivedThread';

const mockGetAllCommands = jest.fn();
const mockGetThread = jest.fn();
const mockPostMessage = jest.fn();
const mockGetUsers = jest.fn();
const mockDownloadFile = jest.fn();
const mockStoreThread = jest.fn();
const mockStoreFile = jest.fn();

jest.mock('../../shared/TrackedSlackMessageRepository', () => ({
  TrackedSlackMessageRepository: jest.fn().mockImplementation(() => ({
    getAllCommands: mockGetAllCommands,
  })),
}));

jest.mock('../SlackClient', () => ({
  SlackClient: jest.fn().mockImplementation(() => ({
    getThread: mockGetThread,
    postMessage: mockPostMessage,
    getUsers: mockGetUsers,
    downloadFile: mockDownloadFile,
  })),
}));

jest.mock('../S3StorageService', () => ({
  S3StorageService: jest.fn().mockImplementation(() => ({
    storeThread: mockStoreThread,
    storeFile: mockStoreFile,
  })),
}));

describe('ArchiverService', () => {
  let service: ArchiverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArchiverService('test-table', 'test-token', 'test-bucket');
  });

  test('processes new messages and sends success notification', async () => {
    const message: TrackedSlackMessage = {
      messageId: 'msg-1',
      timestamp: new Date(),
      trackingGoal: 'audit',
      threadId: 'thread-1',
      channelId: 'channel-1',
    };

    const users: SlackUser[] = [{ id: 'user1', name: 'Test User' }];

    const thread = {
      threadId: 'thread-1',
      messages: [{ ts: '1', user: 'user1', text: 'test', type: 'message' }],
      lastUpdated: new Date(),
    };

    mockGetAllCommands.mockResolvedValue([message]);
    mockGetUsers.mockResolvedValue(users);
    mockGetThread.mockResolvedValue(thread);
    mockStoreThread.mockResolvedValue('s3://bucket/key');

    await service.processCommands();

    expect(mockGetUsers).toHaveBeenCalled();
    expect(mockGetThread).toHaveBeenCalledWith('channel-1', 'thread-1');
    expect(mockStoreThread).toHaveBeenCalledWith('msg-1', thread, message.timestamp, 'audit');
    expect(mockPostMessage).toHaveBeenCalledWith('channel-1', 'thread-1', expect.anything());
  });

  test('sends error notification when archiving fails', async () => {
    const message: TrackedSlackMessage = {
      messageId: 'msg-1',
      timestamp: new Date(),
      trackingGoal: 'incident',
      threadId: 'thread-1',
      channelId: 'channel-1',
    };

    mockGetAllCommands.mockResolvedValue([message]);
    mockGetUsers.mockResolvedValue([]);
    mockGetThread.mockRejectedValue(new Error('Slack API error'));

    await service.processCommands();

    expect(mockPostMessage).toHaveBeenCalledWith('channel-1', 'thread-1', expect.anything());
  });

  test('processes messages newer than 1 day every time', async () => {
    const recentMessage: TrackedSlackMessage = {
      messageId: 'msg-1',
      timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      trackingGoal: 'audit',
      threadId: 'thread-1',
      channelId: 'channel-1',
    };

    mockGetAllCommands.mockResolvedValue([recentMessage]);
    mockGetUsers.mockResolvedValue([]);
    mockGetThread.mockResolvedValue({ threadId: 'thread-1', messages: [], lastUpdated: new Date() });
    mockStoreThread.mockResolvedValue('s3://bucket/key');

    await service.processCommands();

    expect(mockGetThread).toHaveBeenCalled();
  });

  test('skips already archived threads', async () => {
    const message: TrackedSlackMessage = {
      messageId: 'msg-1',
      timestamp: new Date(),
      trackingGoal: 'audit',
      threadId: 'thread-1',
      channelId: 'channel-1',
    };

    const thread = {
      threadId: 'thread-1',
      messages: [
        { ts: '1', user: 'user1', text: 'test', type: 'message' },
        { ts: '2', user: 'bot', text: SUCCESS_TEXT, type: 'message' },
      ],
      lastUpdated: new Date(),
    };

    mockGetAllCommands.mockResolvedValue([message]);
    mockGetUsers.mockResolvedValue([]);
    mockGetThread.mockResolvedValue(thread);

    await service.processCommands();

    expect(mockStoreThread).not.toHaveBeenCalled();
  });

  test('downloads and stores files from messages', async () => {
    const message: TrackedSlackMessage = {
      messageId: 'msg-1',
      timestamp: new Date(),
      trackingGoal: 'audit',
      threadId: 'thread-1',
      channelId: 'channel-1',
    };

    const thread = {
      threadId: 'thread-1',
      messages: [
        {
          ts: '1',
          user: 'user1',
          text: 'test',
          type: 'message',
          files: [{ id: 'file1', name: 'test.png', url_private: 'https://slack.com/file', mimetype: 'image/png' }],
        },
      ],
      lastUpdated: new Date(),
    };

    mockGetAllCommands.mockResolvedValue([message]);
    mockGetUsers.mockResolvedValue([]);
    mockGetThread.mockResolvedValue(thread);
    mockDownloadFile.mockResolvedValue(Buffer.from('file-data'));
    mockStoreFile.mockResolvedValue('s3://bucket/file-key');
    mockStoreThread.mockResolvedValue('s3://bucket/thread-key');

    await service.processCommands();

    expect(mockDownloadFile).toHaveBeenCalledWith('https://slack.com/file');
    expect(mockStoreFile).toHaveBeenCalledWith('msg-1', 'thread-1', 'file1', 'test.png',
      expect.any(Buffer),
      'image/png',
      message.timestamp,
      'audit');
  });

});
