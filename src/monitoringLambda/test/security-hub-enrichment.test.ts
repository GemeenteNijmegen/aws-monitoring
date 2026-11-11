import { Configuration } from '../../DeploymentEnvironments';
import { enrichSecurityHubMessage } from '../SecurityHubEnrichment';
import { SecurityHubFindingLookup } from '../SecurityHubFindingLookup';
import { SnsEventHandler } from '../SnsEventHandler';
import { getEventFromFilePath } from './util';

const withGroup = { securityHubActionsUserGroupId: 'S1', deployToEnvironments: [] } as unknown as Configuration;
const withoutGroup = { deployToEnvironments: [] } as unknown as Configuration;

async function payloadFrom(sample: string) {
  const event = await getEventFromFilePath(`samples/${sample}`);
  return JSON.parse(event.Records[0].Sns.Message);
}

function fakeLookup(result: any): SecurityHubFindingLookup {
  return { lookup: async () => result } as unknown as SecurityHubFindingLookup;
}

function finding(status: string) {
  return {
    Id: 'arn:aws:securityhub:eu-central-1:1:finding/x',
    ProductArn: 'arn:aws:securityhub:eu-central-1::product/aws/securityhub',
    Title: 'Found title',
    Severity: { Label: 'CRITICAL' },
    AwsAccountId: '836443378780',
    Region: 'eu-central-1',
    Workflow: { Status: status },
    Resources: [{ Type: 'AwsCodeBuildProject', Id: 'r1' }],
    Vulnerabilities: [{ Id: 'CVE-1', FixAvailable: 'YES', ExploitAvailable: 'NO' }],
  };
}

const blocksOf = (slack: any) => slack.getSlackMessage().blocks as any[];
const hasButton = (slack: any) => blocksOf(slack).some(b => b.type === 'actions');
const texts = (slack: any) => JSON.stringify(blocksOf(slack));

describe('enrichSecurityHubMessage', () => {
  test('button on single new finding', async () => {
    const payload = await payloadFrom('securityhub-critical.json');
    const slack = await enrichSecurityHubMessage(payload, 'acc', withGroup, fakeLookup({ kind: 'found', finding: finding('NEW') }));
    expect(hasButton(slack)).toBe(true);
    expect(texts(slack)).toContain('Fix available');
    expect(texts(slack)).toContain('Exploit available');
    expect(texts(slack)).toContain('Found title');
  });

  test('button on notified finding', async () => {
    const payload = await payloadFrom('securityhub-critical.json');
    const slack = await enrichSecurityHubMessage(payload, 'acc', withGroup, fakeLookup({ kind: 'found', finding: finding('NOTIFIED') }));
    expect(hasButton(slack)).toBe(true);
  });

  test.each(['SUPPRESSED', 'RESOLVED'])('no button when closed (%s)', async (status) => {
    const payload = await payloadFrom('securityhub-critical.json');
    const slack = await enrichSecurityHubMessage(payload, 'acc', withGroup, fakeLookup({ kind: 'found', finding: finding(status) }));
    expect(hasButton(slack)).toBe(false);
    expect(texts(slack)).not.toContain('Actions unavailable');
    expect(texts(slack)).toContain('Found title');
  });

  test('no button when group unset', async () => {
    const payload = await payloadFrom('securityhub-critical.json');
    const slack = await enrichSecurityHubMessage(payload, 'acc', withoutGroup, fakeLookup({ kind: 'found', finding: finding('NEW') }));
    expect(hasButton(slack)).toBe(false);
    expect(texts(slack)).not.toContain('Actions unavailable');
    expect(texts(slack)).toContain('Found title');
  });

  test.each([
    ['none', { kind: 'none' }],
    ['multiple', { kind: 'multiple' }],
    ['error', { kind: 'error', error: new Error('x') }],
  ])('notice on %s', async (_name, result) => {
    const payload = await payloadFrom('securityhub-critical.json');
    const slack = await enrichSecurityHubMessage(payload, 'acc', withGroup, fakeLookup(result));
    expect(hasButton(slack)).toBe(false);
    expect(texts(slack)).toContain('Actions unavailable for this alert');
    expect(texts(slack)).toContain(payload.Title);

    const quiet = await enrichSecurityHubMessage(payload, 'acc', withoutGroup, fakeLookup(result));
    expect(texts(quiet)).not.toContain('Actions unavailable');
  });
});

describe('SnsEventHandler enrich', () => {
  const handler = new SnsEventHandler(withoutGroup);

  test('sends plain alert when severity is missing', async () => {
    const event = await getEventFromFilePath('samples/securityhub-critical.json');
    const payload = JSON.parse(event.Records[0].Sns.Message);
    delete payload.Severity;
    event.Records[0].Sns.Message = JSON.stringify(payload);
    const handled = handler.handle(event);
    expect(handled).not.toBe(false);
    expect((handled as any).enrich).toBeUndefined();
  });

  test('HIGH has no enrich, CRITICAL has', async () => {
    const high = handler.handle(await getEventFromFilePath('samples/securityhub-new-lz.json'));
    expect((high as any).enrich).toBeUndefined();
    const critical = handler.handle(await getEventFromFilePath('samples/securityhub-critical.json'));
    expect(typeof (critical as any).enrich).toBe('function');
  });
});
