import { Configuration } from '../DeploymentEnvironments';
import { Message } from './Message';
import { SecurityHubFindingLookup } from './SecurityHubFindingLookup';
import { renderSecurityHubView } from './SecurityHubMessage';
import { viewFromFinding, viewFromPayload } from './SecurityHubView';
import { SlackMessage } from './SlackMessage';

const OPEN_WORKFLOW_STATUSES = ['NEW', 'NOTIFIED'];
const UNAVAILABLE_NOTICE = 'Actions unavailable for this alert';

/**
 * Look up the full finding for a critical Security Hub alert and render a richer
 * message. A Suppress button is added only for a single open finding and when
 * the actions user group is configured.
 */
export async function enrichSecurityHubMessage(
  payload: any,
  accountName: string,
  configuration: Configuration,
  lookup: SecurityHubFindingLookup = new SecurityHubFindingLookup(),
): Promise<SlackMessage> {
  const actionsEnabled = !!configuration.securityHubActionsUserGroupId;
  const result = await lookup.lookup(payload);
  const message = new Message();

  if (result.kind === 'found') {
    const view = viewFromFinding(result.finding);
    const open = OPEN_WORKFLOW_STATUSES.includes(view.workflowStatus ?? '');
    const button = actionsEnabled && open && view.findingId && view.productArn
      ? { id: view.findingId, productArn: view.productArn }
      : undefined;
    return renderSecurityHubView(message, view, { accountName, button }).getSlackMessage();
  }

  return renderSecurityHubView(message, viewFromPayload(payload), {
    accountName,
    notice: actionsEnabled ? UNAVAILABLE_NOTICE : undefined,
  }).getSlackMessage();
}
