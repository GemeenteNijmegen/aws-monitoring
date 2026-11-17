import { Logger } from '@aws-lambda-powertools/logger';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { slackAuthenticate } from '../../audit/slackbot/slack-authenticate';
import {
  buildSuppressView,
  decodeButtonValue,
  MAX_REASON_LENGTH,
  REASON_ACTION_ID,
  REASON_BLOCK_ID,
  SUPPRESS_ACTION_ID,
  SUPPRESS_CALLBACK_ID,
  SuppressJob,
  SuppressMetadata,
} from '../shared/ActionPayload';
import { SlackApi } from '../shared/SlackApi';

export interface ReceiverDeps {
  signingSecret: string;
  slack: Pick<SlackApi, 'openModal'>;
  enqueue: (job: SuppressJob) => Promise<void>;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
}

const ok = (): APIGatewayProxyResult => ({ statusCode: 200, body: '' });
const badRequest = (): APIGatewayProxyResult => ({ statusCode: 400, body: '' });
const forbidden = (): APIGatewayProxyResult => ({ statusCode: 403, body: '' });
const reasonError = (message: string): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ response_action: 'errors', errors: { [REASON_BLOCK_ID]: message } }),
});

export async function handleSlackInteraction(event: APIGatewayProxyEvent, deps: ReceiverDeps): Promise<APIGatewayProxyResult> {
  // Authenticate before touching the payload
  if (!await slackAuthenticate(event, deps.signingSecret)) {
    deps.logger.warn('Slack request rejected: authentication failed');
    return forbidden();
  }

  const payload = parsePayload(event.body);
  if (!payload) {
    deps.logger.warn('Slack request rejected: malformed body');
    return badRequest();
  }

  const type = typeof payload.type === 'string' ? payload.type : 'unknown';
  const slackUserId = typeof payload.user?.id === 'string' ? payload.user.id : 'unknown';
  deps.logger.info('Slack interaction received', { type, slackUserId });

  if (type === 'block_actions') {
    return handleBlockActions(payload, slackUserId, deps);
  }
  if (type === 'view_submission') {
    return handleViewSubmission(payload, slackUserId, deps);
  }
  return ok();
}

function parsePayload(body: string | null): any | undefined {
  if (!body) {
    return undefined;
  }
  const raw = new URLSearchParams(body).get('payload');
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function handleBlockActions(payload: any, slackUserId: string, deps: ReceiverDeps): Promise<APIGatewayProxyResult> {
  const action = Array.isArray(payload.actions) ? payload.actions.find((a: any) => a?.action_id === SUPPRESS_ACTION_ID) : undefined;
  if (!action) {
    return ok();
  }

  let finding;
  try {
    finding = decodeButtonValue(action.value);
  } catch {
    deps.logger.warn('Ignoring suppress action with undecodable button value', { slackUserId });
    return ok();
  }

  const view = buildSuppressView({ ...finding, responseUrl: payload.response_url });
  try {
    await deps.slack.openModal(payload.trigger_id, view);
  } catch (error) {
    deps.logger.error('Failed to open suppress modal', { slackUserId, error: errorMessage(error) });
  }
  return ok();
}

async function handleViewSubmission(payload: any, slackUserId: string, deps: ReceiverDeps): Promise<APIGatewayProxyResult> {
  const view = payload.view;
  if (view?.callback_id !== SUPPRESS_CALLBACK_ID) {
    return ok();
  }

  const meta = parseMetadata(view.private_metadata);
  if (!meta) {
    deps.logger.warn('Suppress submission rejected: invalid metadata', { slackUserId });
    return badRequest();
  }

  const rawReason = view.state?.values?.[REASON_BLOCK_ID]?.[REASON_ACTION_ID]?.value;
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (!reason) {
    return reasonError('Please provide a reason.');
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return reasonError(`The reason can be at most ${MAX_REASON_LENGTH} characters.`);
  }

  try {
    await deps.enqueue({ id: meta.id, productArn: meta.productArn, responseUrl: meta.responseUrl, slackUserId, reason });
  } catch (error) {
    deps.logger.error('Failed to enqueue suppress job', { slackUserId, error: errorMessage(error) });
    return reasonError('Something went wrong while submitting. Please try again.');
  }
  return ok();
}

function parseMetadata(value: unknown): SuppressMetadata | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const meta = JSON.parse(value);
    if (meta && [meta.id, meta.productArn, meta.responseUrl].every((v: unknown) => typeof v === 'string' && v)) {
      return { id: meta.id, productArn: meta.productArn, responseUrl: meta.responseUrl };
    }
  } catch {
    // fall through
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
