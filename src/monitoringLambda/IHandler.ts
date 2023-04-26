import { SlackMessage } from './SlackMessage';

export type Priority = 'low' | 'avg' | 'high';

export interface HandledEvent {
  priority: Priority;
  message: SlackMessage;
}

export interface IHandler {

  /**
   * Checks if this handler can handle the event
   * (i.e. handle can be called with this event)
   * @param event
   * @returns true if can handle the event false otherwise
   */
  canHandle(event: any): boolean;

  /**
   * Handle the event and return an HandledEvent containing
   * the slack message and priority, if the event is excluded
   * return false.
   * @param event
   */
  handle(event: any): HandledEvent | false;

}