import axios from 'axios';
import { HandledEvent, Priority } from './IHandler';
import { LogsEventHandler } from './LogsEventHandler';
import { SnsEventHandler } from './SnsEventHandler';


/**
 * Tries to find a handler and use it to handle the event
 * each handler returns a HandledEvent which is send to slack.
 * @param event
 * @returns
 */
export async function handler(event: any) {

  const sns = new SnsEventHandler();
  const logs = new LogsEventHandler();

  const handlers = [sns, logs];

  const matchedHandler = handlers.find(h => h.canHandle(event));
  if (!matchedHandler) {
    console.error('No handler found for event', JSON.stringify(event));
    return;
  }

  try {
    const handled = matchedHandler.handle(event);
    if (handled) {
      await sendMessageToSlack(handled);
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * Use axios to send a message to Slack
 *
 * @param message the message
 * @returns axios response
 */
export async function sendMessageToSlack(handledEvent: HandledEvent) {
  let url = getSlackUrl(handledEvent.priority);
  if (!url) {
    throw Error('No slack webhook url defined');
  }
  const message = handledEvent.message.getSlackMessage();
  return axios.post(url, message);
}

function getSlackUrl(priority: Priority) {
  switch (priority) {
    case 'low':
      return process.env?.SLACK_WEBHOOK_URL_LOW_PRIO;
    case 'avg':
    case 'high':
    default:
      return process.env?.SLACK_WEBHOOK_URL;
  }
}

/**
 * Get the env. var. account name.
 * @returns the account name, if not set throws an error.
 */
export function getAccount(): string {
  const account = process.env.ACCOUNT_NAME;
  if (!account) {
    throw Error('No account name defined in environment');
  }
  return account;
}
