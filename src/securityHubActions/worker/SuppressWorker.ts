import { Logger } from '@aws-lambda-powertools/logger';
import { BatchUpdateFindingsCommand, GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { Message } from '../../monitoringLambda/Message';
import { escapeSlackText, renderSecurityHubView } from '../../monitoringLambda/SecurityHubMessage';
import { isSuppressEligibleSeverity, viewFromFinding } from '../../monitoringLambda/SecurityHubView';
import { SuppressJob } from '../shared/ActionPayload';
import { SlackApi } from '../shared/SlackApi';

export type SuppressOutcome = 'suppressed' | 'already-suppressed' | 'not-allowed' | 'not-critical' | 'stale' | 'not-found' | 'failed';

export interface SuppressWorkerDeps {
  slack: Pick<SlackApi, 'listGroupMembers'>;
  securityHub: SecurityHubClient;
  respond: (url: string, body: object) => Promise<void>;
  userGroupId: string;
  accountNameFor: (accountId: string) => string;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
}

const OPEN_STATUSES = ['NEW', 'NOTIFIED'];
const MAX_NOTE_LENGTH = 512;
const SLACK_RESPONSE_ORIGIN = 'https://hooks.slack.com';

function isSlackResponseUrl(url: string): boolean {
  try {
    return new URL(url).origin === SLACK_RESPONSE_ORIGIN;
  } catch {
    return false;
  }
}

function displayName(author?: string): string {
  if (!author) { return 'unknown'; }
  if (author.startsWith('slack:')) { return `<@${author.substring('slack:'.length)}>`; }
  return escapeSlackText(author);
}

export class SuppressWorker {
  private readonly deps: SuppressWorkerDeps;

  constructor(deps: SuppressWorkerDeps) {
    this.deps = deps;
  }

  async handle(job: SuppressJob): Promise<SuppressOutcome> {
    const outcome = await this.process(job);
    this.deps.logger.info('Suppress request handled', {
      outcome,
      findingId: job.id,
      slackUserId: job.slackUserId,
      reasonLength: job.reason.length,
    });
    return outcome;
  }

  private async process(job: SuppressJob): Promise<SuppressOutcome> {
    // 1. Membership. Any error is not-allowed.
    let allowed = false;
    try {
      const members = await this.deps.slack.listGroupMembers(this.deps.userGroupId);
      allowed = members.includes(job.slackUserId);
    } catch (error) {
      this.deps.logger.error('Membership check failed', { error: (error as Error)?.message });
    }
    if (!allowed) {
      await this.ephemeral(job, 'You are not allowed to suppress findings.');
      return 'not-allowed';
    }

    // 2. Look up the finding.
    let finding;
    try {
      const result = await this.deps.securityHub.send(new GetFindingsCommand({
        Filters: {
          Id: [{ Comparison: 'EQUALS', Value: job.id }],
          ProductArn: [{ Comparison: 'EQUALS', Value: job.productArn }],
        },
        MaxResults: 1,
      }));
      finding = result.Findings?.[0];
    } catch (error) {
      this.deps.logger.error('GetFindings failed', { findingId: job.id, error: (error as Error)?.message });
      await this.ephemeral(job, 'Could not look up the finding. Please try again.');
      return 'failed';
    }
    if (!finding) {
      await this.ephemeral(job, 'This finding could not be found.');
      return 'not-found';
    }

    // 3. Severity.
    if (!isSuppressEligibleSeverity(finding.Severity?.Label)) {
      await this.ephemeral(job, 'Only critical findings can be suppressed from Slack.');
      return 'not-critical';
    }

    const view = viewFromFinding(finding);
    const accountName = this.deps.accountNameFor(view.accountId);
    const status = finding.Workflow?.Status ?? '';
    const noteAuthor = displayName(finding.Note?.UpdatedBy);
    const noteText = escapeSlackText(finding.Note?.Text ?? '');

    // 4. Workflow status.
    if (!OPEN_STATUSES.includes(status)) {
      const alreadySuppressed = status === 'SUPPRESSED';
      const details = finding.Note ? ` Last note by ${noteAuthor}: ${noteText}` : '';
      if (!alreadySuppressed) {
        await this.ephemeral(job, `This finding is already ${escapeSlackText(status || 'unknown')}.${details}`);
      }
      await this.redraw(job, view, accountName, status || 'unknown', finding.Note ? `${noteAuthor}: ${noteText}` : undefined);
      return alreadySuppressed ? 'already-suppressed' : 'stale';
    }

    // 5. Write.
    const noteTextOut = `Suppressed via Slack by ${job.slackUserId}: ${job.reason}`.substring(0, MAX_NOTE_LENGTH);
    try {
      const result = await this.deps.securityHub.send(new BatchUpdateFindingsCommand({
        FindingIdentifiers: [{ Id: job.id, ProductArn: job.productArn }],
        Workflow: { Status: 'SUPPRESSED' },
        Note: { Text: noteTextOut, UpdatedBy: `slack:${job.slackUserId}` },
      }));
      if (result.UnprocessedFindings && result.UnprocessedFindings.length > 0) {
        throw new Error(`Unprocessed findings: ${result.UnprocessedFindings.map(f => f.ErrorCode).join(',')}`);
      }
    } catch (error) {
      this.deps.logger.error('BatchUpdateFindings failed', { findingId: job.id, error: (error as Error)?.message });
      await this.ephemeral(job, 'Suppressing the finding failed. Please try again.');
      return 'failed';
    }

    // 6. Redraw.
    await this.redraw(job, { ...view, workflowStatus: 'SUPPRESSED' }, accountName, 'SUPPRESSED', `<@${job.slackUserId}>: ${escapeSlackText(job.reason)}`);
    return 'suppressed';
  }

  private async ephemeral(job: SuppressJob, text: string) {
    await this.safeRespond(job.responseUrl, { response_type: 'ephemeral', replace_original: false, text });
  }

  private async redraw(job: SuppressJob, view: ReturnType<typeof viewFromFinding>, accountName: string, status: string, detail?: string) {
    const message = renderSecurityHubView(new Message(), view, { accountName });
    // Already escaped by the caller; the renderer would escape the mention.
    message.addSection(`*${escapeSlackText(status)}*${detail ? ` by ${detail}` : ''}`);
    await this.safeRespond(job.responseUrl, {
      replace_original: true,
      blocks: message.getSlackMessage().getSlackMessage().blocks,
    });
  }

  /**
   * Never throws: the write may already have happened, and the response_url
   * expires. Only Slack's own hooks origin is ever contacted.
   */
  private async safeRespond(url: string, body: object) {
    if (!isSlackResponseUrl(url)) {
      this.deps.logger.warn('Refusing to respond to a response_url outside hooks.slack.com');
      return;
    }
    try {
      await this.deps.respond(url, body);
    } catch (error) {
      this.deps.logger.error('Responding to Slack failed', { error: (error as Error)?.message });
    }
  }
}
