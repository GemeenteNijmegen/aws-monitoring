import { LogsEventHandler } from './LogsEventHandler';
import { SnsEventHandler } from './SnsEventHandler';
import { getConfiguration } from '../DeploymentEnvironments';

/**
 * Tries to find a handler and use it to handle the event
 *
 * Each handler returns a HandledEvent which is send to slack.
 * **NB** The first matching handler will be used, even if multiple
 * matching handlers exist.
 *
 * @param event
 */
export async function handler(event: any) {
  console.log(JSON.stringify(event));
  const configuration = getConfiguration(process.env.BRANCH_NAME ?? 'main-new-lz');
  const sns = new SnsEventHandler(configuration);
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
      await handled.message.send(handled.priority);
      console.log('sent message');
      return;
    }
    console.log('did not send message, not handled.');
  } catch (error) {
    console.error(error);
  }
};
