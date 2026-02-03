import { APIGatewayProxyEvent } from "aws-lambda";
import { SlackClient } from "../archiver/SlackClient";
import { TrackedSlackMessage } from "../shared/models/TrackedSlackMessage";
import { SlackMessage } from "../shared/SlackMessage";
import { TrackedSlackMessageRepository } from "../shared/TrackedSlackMessageRepository";
import { slackAuthenticate } from "./slack-authenticate";
import { TrackedSlackMessageParser } from "./TrackedSlackMessageParser";

export interface SlackbotHandlerOptions {
  slackSecret: string,
  slackClient: SlackClient,
  trackedSlackMessagesRepository: TrackedSlackMessageRepository;
}

export class SlackbotHandler {

  constructor(private readonly props: SlackbotHandlerOptions) {
  }

  async handleRequest(event: APIGatewayProxyEvent) {

    let trackedSlackMessage: TrackedSlackMessage | undefined = undefined;
    try {

      // Parse body
      const body = JSON.parse(event.body ?? '{}');

      // Authenticate
      const authenticated = await slackAuthenticate(event, this.props.slackSecret);
      if (!authenticated) {
        console.log('Unauthorized!');
        return this.response('Unauthorized!', 403);
      }
      console.log('Authenticated!');

      if (event.headers['X-Slack-Retry-Num']) {
        console.log('Retry message from Slack, skipping...');
        return this.response('Skipped retry', 200);
      }

      // Parse message
      trackedSlackMessage = TrackedSlackMessageParser.parse(event);

      // Store message in message table
      await this.props.trackedSlackMessagesRepository.save(trackedSlackMessage);
      console.log(`Successfully saved message (${trackedSlackMessage.messageId}) to DynamoDB for ${trackedSlackMessage.trackingGoal} registration purposes`);

      // Send response
      await this.props.slackClient.postMessage(
        trackedSlackMessage.channelId,
        trackedSlackMessage.threadId,
        this.successMessage(trackedSlackMessage.trackingGoal),
      );
      return this.response(body);

    } catch (error) {
      console.error('Error processing message:', error);

      // send a nice error if possible
      if (trackedSlackMessage?.threadId && error instanceof Error) {
        await this.props.slackClient.postMessage(trackedSlackMessage.channelId, trackedSlackMessage.threadId, this.errorMessage(error.message));
      }

      return this.response({}, 500);
    }
  }

  private response(body: any, statusCode: number = 200) {
    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      return {
        statusCode: statusCode,
        body: JSON.stringify({ challenge: body.challenge }),
      };
    }
    return {
      statusCode: statusCode,
      body: '',
    };
  }

  private successMessage(category: string) {
    return new SlackMessage()
      .addHeader('🔎 Audit tracking gestart')
      .addContext({ Category: category })
      .addSection('Deze thread wordt nu gevolgd voor incidentregistratie. Nieuwe berichten worden automatisch opgeslagen.');
  }

  private errorMessage(reason: string) {
    return new SlackMessage()
      .addHeader('❗️ Er ging iets mis')
      .addSection(`Fout: ${reason}`);
  }


}