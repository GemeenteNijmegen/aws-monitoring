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

export interface LogSubscriptionEventProps {
  owner?: string;
  logGroup?: string;
  logStream?: string;
}

export function constructLogSubscriptionEvent(props: LogSubscriptionEventProps, ...messages: any[]): any {

  const logEvent = {
    owner: props.owner ?? '123456789012',
    logGroup: props.logGroup ?? 'test-log-group',
    logStream: props.logGroup ? `${props.logGroup}/12342` : 'test-log-group/124124',
    subscriptionFilters: ['test-filter'],
    messageType: 'DATA_MESSAGE',
    logEvents: messages.map((m, i) => {
      return {
        id: i,
        timestamp: 123,
        message: typeof m == 'string' ? m : JSON.stringify(m),
      };
    }),
  };

  // Encode the log event
  const base64 = Buffer.from(JSON.stringify(logEvent));
  const payload = zlib.gzipSync(base64);
  // Construct and return the log subscription event
  return { awslogs: { data: payload.toString('base64') } };

}