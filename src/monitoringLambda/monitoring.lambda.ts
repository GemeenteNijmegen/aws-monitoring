import { LogsEventHandler } from './LogsEventHandler';
import { SnsEventHandler } from './SnsEventHandler';


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
      await handled.message.send(handled.priority);
    }
  } catch (error) {
    console.error(error);
  }
};
