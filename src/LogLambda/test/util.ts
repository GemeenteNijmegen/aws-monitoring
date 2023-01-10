import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

export async function getStringFromFilePath(filePath: string): Promise<string> {
  return new Promise((res, rej) => {
    fs.readFile(path.join(__dirname, filePath), (err, data) => {
      if (err) { return rej(err); }
      return res(data.toString());
    });
  });
}

export async function getEventFromFilePath(filePath: string): Promise<any> {
  const event = await getStringFromFilePath(filePath);
  return JSON.parse(event);
}

export function constructLogSubscriptionEvent(...messages: any[]) {

  const logEvent = {
    owner: '123456789012',
    logGroup: 'CloudTrail',
    logStream: 'test-log-group/124124',
    subscriptionFilters: [
      'Destination',
    ],
    messageType: 'DATA_MESSAGE',
    logEvents: messages.map((m, i) => {
      return {
        id: i,
        timestamp: 1432826855000,
        message: m,
      };
    }),
  };

  const base64 = Buffer.from(JSON.stringify(logEvent));
  const payload = zlib.gzipSync(base64);

  const event = { awslogs: { data: payload.toString('base64') } };
  console.log(JSON.stringify(event, null, 2));

}