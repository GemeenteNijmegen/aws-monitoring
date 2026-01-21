import { APIGatewayProxyEvent } from 'aws-lambda';
import { SlackCommand } from '../shared/models/SlackCommand';

export class CommandParser {
  static parse(event: APIGatewayProxyEvent): SlackCommand {
    const parameters = new URLSearchParams(event.body ?? '');
    const command = parameters.get('command');
    const responseUrl = parameters.get('response_url');
    const triggerId = parameters.get('trigger_id');
    const threadId = parameters.get('thread_ts');

    if (!command || !responseUrl || !triggerId) {
      throw new Error('Command, responseUrl or triggerId not set in slackmessage');
    }

    const commandType = this.getCommandType(command);
    if (!commandType) {
      throw new Error('Invalid or unknown command type');
    }

    if (!threadId) {
      throw new Error('Thread ID not found in slack message');
    }

    return {
      messageId: triggerId,
      timestamp: new Date(),
      commandType,
      threadId: threadId,
    };
  }

  private static getCommandType(command: string): 'audit' | 'incident' | null {
    switch (command) {
      case '/audit':
        return 'audit';
      case '/incident':
        return 'incident';
      default:
        return null;
    }
  }

  private static extractThreadId(parameters: URLSearchParams): string | undefined {
    try {

      return;
    } catch {
      return undefined;
    }
  }
}