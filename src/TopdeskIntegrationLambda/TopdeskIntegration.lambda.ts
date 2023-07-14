import { SQSEvent, SQSRecord } from 'aws-lambda';
import { SlackMessage } from './SlackMessage';
import { TopDeskClient } from './TopDeskClient';

/**
 * TopDesk client for creating tickets
 */
const topDeskClient = new TopDeskClient();

/**
 * Interface to parse actions from the slack message
 * Different interactions have different actions
 */
interface Action {
  id: string;
  value: any;
}


export async function handler(event: SQSEvent) {
  console.info('Incomming event:', event);
  // Handle records
  for (let record of event.Records) {
    await handleRecord(record);
  }
}

export async function handleRecord(record: SQSRecord) {
  // Already authenticated (before send to queue)
  try {
    const payload = JSON.parse(record.body);
    return await handleTopdeskTicketCreation(payload);
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Please check the logs for details' }),
    };
  }
}

async function handleTopdeskTicketCreation(payload: any) {

  const message = SlackMessage.fromPayload(payload);

  // Parse the action details and crate a topdesk ticket
  const action = getActionFromPayload(payload);
  const ticketId = await topDeskClient.createNewTicket({
    title: action.value.title,
    htmlDescription: action.value.description,
    priority: action.value.priority,
  });
  console.debug('Ticket is created with ID:', ticketId);

  // Send back the response to slack
  message.removeAllInteractionBlocks();
  const link = `${process.env.TOPDESK_DEEP_LINK_URL}${ticketId}`;
  message.addLink('Go to TopDesk ticket', link);
  await message.send();

  return {
    statusCode: 200,
    body: JSON.stringify('ok'),
  };

};

function getActionFromPayload(payload: any) : Action {
  if (!payload.actions || payload.actions.length != 1) {
    throw Error('Could not get action from payload');
  }
  const payloadAction = payload.actions[0];

  const base64ActionValue = payloadAction.value;
  const actionValue = Buffer.from(base64ActionValue, 'base64').toString('utf-8');
  const value = JSON.parse(actionValue);

  return {
    id: payloadAction.action_id,
    value: value,
  };
}