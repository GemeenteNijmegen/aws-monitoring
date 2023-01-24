import * as zlib from 'zlib';
import { CloudWatchLogsDecodedData, CloudWatchLogsEvent } from 'aws-lambda';
import { HandledEvent, IHandler } from './IHandler';
import { LogsMessageFormatter, CloudTrailErrorLogsMessageFormatter } from './MessageFormatter';
import { getAccount, stringMatchesPatternInArray } from './utils';


const excludedMessageStrings = [
  'assumed-role/config-drift-detection-role/configLambdaExecution is not authorized to perform:',
  'AWSServiceRoleForSecurityHub/securityhub is not authorized to perform: SNS:ListSubscriptionsByTopic on resource: .*:CWAlarmDummyTopic',
  'AWSServiceRoleForAccessAnalyzer/access-analyzer is not authorized to perform: kms:DescribeKey on resource', // Only errors in development/production accounts, probably solved with new landing zone
];


export class LogsEventHandler implements IHandler {

  canHandle(event: any): boolean {
    return event?.awslogs?.data != undefined;
  }

  handle(event: any): HandledEvent | false {
    try {
      const parsed = parseMessageFromEvent(event);

      // Remove excluded log events
      parsed.logEvents = parsed.logEvents.filter((currentEvent) => !stringMatchesPatternInArray(excludedMessageStrings, currentEvent.message));
      // If all messages are excluded, stop handling.
      if (parsed.logEvents.length == 0) { return false; }

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