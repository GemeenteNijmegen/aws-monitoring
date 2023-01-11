import * as zlib from 'zlib';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { getAccount } from '.';
import { HandledEvent, IHandler } from './IHandler';
import { LogsMessageFormatter } from './MessageFormatter';


export class LogsEventHandler implements IHandler {

  canHandle(event: any): boolean {
    return event?.awslogs?.data != undefined;
  }

  handle(event: any): HandledEvent | false {
    try {
      const parsed = parseMessageFromEvent(event);
      const formatter = new LogsMessageFormatter(parsed, getAccount());
      return {
        priority: 'high',
        message: formatter.formattedMessage(),
      };
    } catch (error) {
      console.error(error);
    }
    return false;
  }
}

function parseMessageFromEvent(event: CloudWatchLogsEvent): CloudWatchLogsDecodedData {
  try {
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const json = zlib.gunzipSync(payload);
    return JSON.parse(json.toString());
  } catch (error) {
    console.error('Failed parsing message');
    throw error;
  }
}