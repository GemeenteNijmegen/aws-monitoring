import * as path from 'path';
import { getEventFromFilePath } from './util';
import { Configuration } from '../../DeploymentEnvironments';
import { SnsEventHandler } from '../SnsEventHandler';

const config: Configuration = {
  branchName: 'sandbox',
  environmentName: 'development',
  pipelineStackCdkName: 'aws-monitoring-sandbox',
  deployToEnvironments: [
    {
      accountName: 'workload-test',
      accountType: 'development',
      env: { account: '12345678', region: 'eu-central-1' },
    },
    {
      accountName: 'workload-prod',
      accountType: 'production',
      env: { account: '87654321', region: 'eu-central-1' },
    },
  ],
};

// Deze test blijft bewust in het monitoring-pad staan.
// Later kan hier een feature flag omheen komen om Health in de bestaande monitoringroute aan of uit te zetten.
describe('AWS Health current behavior', () => {
  const snsHandler = new SnsEventHandler(config);

  test('a single health event currently becomes one high priority slack message', async () => {
    const event = await getEventFromFilePath(path.join('..', '..', 'healthGrouping', 'samples', 'health-public-account-a.json'));

    const handled = snsHandler.handle(event);
    expect(handled).not.toBe(false);
    if (handled === false) {
      return;
    }

    expect(handled.priority).toBe('high');

    const blocks = handled.message.getSlackMessage().blocks;
    expect(blocks[0].text.text).toBe('Health Dashboard alert: AWS_BILLING_OPERATIONAL_ISSUE');
    expect(blocks[1].elements[0].text).toBe('type: *AWS Health Event*');
  });

  test('two equivalent health events from different accounts currently produce two separate messages', async () => {
    const eventA = await getEventFromFilePath(path.join('..', '..', 'healthGrouping', 'samples', 'health-public-account-a.json'));
    const eventB = await getEventFromFilePath(path.join('..', '..', 'healthGrouping', 'samples', 'health-public-account-b.json'));

    const handledA = snsHandler.handle(eventA);
    const handledB = snsHandler.handle(eventB);

    expect(handledA).not.toBe(false);
    expect(handledB).not.toBe(false);
    if (handledA === false || handledB === false) {
      return;
    }

    const blocksA = handledA.message.getSlackMessage().blocks;
    const blocksB = handledB.message.getSlackMessage().blocks;

    expect(blocksA[0].text.text).toBe('Health Dashboard alert: AWS_BILLING_OPERATIONAL_ISSUE');
    expect(blocksB[0].text.text).toBe('Health Dashboard alert: AWS_BILLING_OPERATIONAL_ISSUE');
    expect(blocksA[2].text.text).toContain('Inaccurate Estimated Billing Data');
    expect(blocksB[2].text.text).toContain('Inaccurate Estimated Billing Data');
    expect(blocksA[1].elements[1].text).toBe('account: *111111111111*');
    expect(blocksB[1].elements[1].text).toBe('account: *222222222222*');
  });
});
