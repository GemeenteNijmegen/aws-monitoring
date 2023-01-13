import * as zlib from 'zlib';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { HandledEvent, IHandler } from './IHandler';
import { LogsMessageFormatter, CloudTrailErrorLogsMessageFormatter } from './MessageFormatter';
import { getAccount } from './utils';


export class LogsEventHandler implements IHandler {

  canHandle(event: any): boolean {
    return event?.awslogs?.data != undefined;
  }

  handle(event: any): HandledEvent | false {
    try {
      const parsed = parseMessageFromEvent(event);
      let formatter = this.selectMessageFormatter(parsed);
      return {
        priority: 'high',
        message: formatter.formattedMessage(),
      };
    } catch (error) {
      console.error(error);
    }
    return false;
  }

  private selectMessageFormatter(parsed: CloudWatchLogsDecodedData) {
    if (this.isCloudtrailErrorLog(parsed)) {
      return new CloudTrailErrorLogsMessageFormatter(parsed, getAccount());
    } else {
      return new LogsMessageFormatter(parsed, getAccount());
    }
  }

  private isCloudtrailErrorLog(parsed: CloudWatchLogsDecodedData) {
    const requiredFields = [
      'errorCode',
      'errorMessage',
      'userIdentity',
      'eventSource',
      'eventName',
    ];
    return parsed.logEvents.find((logEvent) => {
      try {
        const log = JSON.parse(logEvent.message);
        const foundFields = requiredFields.filter((field) => log[field]);
        console.debug(foundFields.length);
        return foundFields.length == requiredFields.length;
      } catch (error) {
        return false;
      }
    });
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