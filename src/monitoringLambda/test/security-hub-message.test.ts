import { SUPPRESS_ACTION_ID } from '../../securityHubActions/shared/ActionPayload';
import { Message } from '../Message';
import { accountNameFor, escapeSlackText, findingConsoleUrl, renderSecurityHubView } from '../SecurityHubMessage';
import { isSuppressEligibleSeverity, SecurityHubView, viewFromPayload } from '../SecurityHubView';
import { getEventFromFilePath } from './util';

async function payloadFrom(sample: string) {
  const event = await getEventFromFilePath(`samples/${sample}`);
  return JSON.parse(event.Records[0].Sns.Message);
}

function render(view: SecurityHubView, opts: any = {}): any[] {
  const message = renderSecurityHubView(new Message(), view, { accountName: 'acc', ...opts });
  return message.getSlackMessage().getSlackMessage().blocks;
}

function baseView(overrides: Partial<SecurityHubView> = {}): SecurityHubView {
  return { title: 'T', accountId: '1', resources: [], ...overrides };
}

const sectionTexts = (blocks: any[]) => blocks.filter(b => b.type === 'section').map(b => b.text.text);

describe('escapeSlackText', () => {
  test('escapes control characters', () => {
    expect(escapeSlackText('<!channel> & <@U1>')).toBe('&lt;!channel&gt; &amp; &lt;@U1&gt;');
  });
});

describe('findingConsoleUrl', () => {
  test('builds the console url', () => {
    const id = 'arn:aws:securityhub:eu-central-1:1:finding/x';
    expect(findingConsoleUrl('eu-central-1', id)).toBe(
      `https://eu-central-1.console.aws.amazon.com/securityhub/home?region=eu-central-1#/findings?search=Id%3D%255Coperator%255C%253AEQUALS%255C%253A${encodeURIComponent(encodeURIComponent(id))}`,
    );
  });
});

describe('accountNameFor', () => {
  test('returns the name of a known account and falls back to the id', () => {
    const configuration: any = { deployToEnvironments: [{ accountName: 'prod', env: { account: '111' } }] };
    expect(accountNameFor(configuration, '111')).toBe('prod');
    expect(accountNameFor(configuration, '222')).toBe('222');
  });
});

describe('renderSecurityHubView', () => {
  test('renders context', async () => {
    const view = viewFromPayload(await payloadFrom('securityhub-critical.json'));
    const blocks = render(view);
    expect(blocks[0].text.text).toBe(`SecurityHub: ${view.title}`);
    const context = blocks.find(b => b.type === 'context');
    const text = context.elements.map((e: any) => e.text).join('\n');
    for (const key of ['severity', 'account', 'region', 'compliance', 'workflow', 'control', 'standard']) {
      expect(text).toContain(`${key}: *`);
    }
    expect(text).toContain('severity: *CRITICAL*');
    expect(text).toContain('account: *acc*');
  });

  test('renders without Resources', async () => {
    const view = viewFromPayload(await payloadFrom('securityhub-no-resources.json'));
    const blocks = render(view);
    expect(sectionTexts(blocks).some(t => t.includes('*AwsCodeBuildProject*'))).toBe(false);
    expect(sectionTexts(blocks)).toHaveLength(1);
  });

  test('joins resources with newlines', () => {
    const blocks = render(baseView({ resources: [{ type: 'A', id: 'a1' }, { type: 'B', id: 'b1' }] }));
    expect(sectionTexts(blocks)).toContain('- *A*: a1\n- *B*: b1');
  });

  test('caps resources at 10 lines', () => {
    const resources = Array.from({ length: 13 }, (_, i) => ({ type: 'T', id: `id${i}` }));
    const text = sectionTexts(render(baseView({ resources })))[0];
    const lines = text.split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe('...and 3 more');
  });

  test('truncates long description', () => {
    const text = sectionTexts(render(baseView({ description: 'x'.repeat(5000) })))[0];
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toContain('ommited');
  });

  test('escapes the description', () => {
    expect(sectionTexts(render(baseView({ description: '<!channel>' })))[0]).toBe('&lt;!channel&gt;');
  });

  test('renders vulnerability line', () => {
    expect(sectionTexts(render(baseView()))).toHaveLength(0);
    const text = sectionTexts(render(baseView({ fixAvailable: 'YES', exploitAvailable: 'NO' })))[0];
    expect(text).toContain('YES');
    expect(text).toContain('NO');
  });

  test('renders links', () => {
    const id = 'arn:aws:securityhub:eu-central-1:1:finding/x';
    const one = sectionTexts(render(baseView({ remediationUrl: 'https://fix.example' })));
    expect(one).toHaveLength(1);
    expect(one[0]).toContain('https://fix.example');
    const two = sectionTexts(render(baseView({ remediationUrl: 'https://fix.example', findingId: id, region: 'eu-central-1' })));
    expect(two).toHaveLength(2);
    expect(two[1]).toContain(findingConsoleUrl('eu-central-1', id));
  });

  test('renders button', () => {
    const button = { id: 'fid', productArn: 'parn' };
    const blocks = render(baseView(), { button });
    const actions = blocks.find(b => b.type === 'actions');
    expect(actions.elements[0].action_id).toBe(SUPPRESS_ACTION_ID);
    expect(actions.elements[0].text.text).toBe('Suppress');
    expect(actions.elements[0].value).toBe(Buffer.from(JSON.stringify(button)).toString('base64'));
  });

  test('renders outcome', () => {
    const blocks = render(baseView(), {
      button: { id: 'fid', productArn: 'parn' },
      outcome: { status: 'Suppressed', by: 'U1', reason: '<!here> ok' },
    });
    expect(blocks.some(b => b.type === 'actions')).toBe(false);
    const last = blocks[blocks.length - 1];
    expect(last.text.text).toContain('&lt;!here&gt; ok');
    expect(last.text.text).toContain('Suppressed');
  });

  test('renders notice', () => {
    expect(sectionTexts(render(baseView(), { notice: 'careful' }))).toContain('careful');
  });
});

describe('non-string payload fields', () => {
  const hostile = { Label: 'CRITICAL' };
  const cases: [string, any][] = [
    ['Severity object', { Severity: hostile }],
    ['Severity number', { Severity: 9 }],
    ['Description number', { Description: 5 }],
    ['Title object', { Title: hostile }],
    ['Region object', { Region: hostile }],
    ['Compliance.Status object', { Compliance: { Status: hostile } }],
    ['ControlId number', { ControlId: 5 }],
    ['StandardsId number', { Compliance: { AssociatedStandards: [{ StandardsId: 5 }] } }],
  ];

  test.each(cases)('%s renders without throwing', (_name, extra) => {
    const payload = { AccountId: '1', Resources: [{ Type: 'T', Id: 'r1' }], ...extra };
    const view = viewFromPayload(payload);
    const blocks = render(view);
    expect(blocks.some(b => b.type === 'header')).toBe(true);
    expect(sectionTexts(blocks).join('\n')).toContain('r1');
    expect(isSuppressEligibleSeverity(view.severity)).toBe(false);
  });
});

describe('remediation link targets', () => {
  const links = (blocks: any[]) => JSON.stringify(blocks);

  test('hostile url cannot inject mentions', () => {
    const blocks = render(baseView({ remediationUrl: 'https://a> <!channel> <https://b' }));
    expect(links(blocks)).not.toContain('<!channel>');
  });

  test('non-https url produces no link', () => {
    const blocks = render(baseView({ remediationUrl: 'http://example.com/x' }));
    expect(links(blocks)).not.toContain('Remediation');
    const js = render(baseView({ remediationUrl: 'javascript:alert(1)' }));
    expect(links(js)).not.toContain('Remediation');
  });

  test('normal https url is unchanged', () => {
    const blocks = render(baseView({ remediationUrl: 'https://docs.aws.amazon.com/x?a=1' }));
    expect(links(blocks)).toContain('<https://docs.aws.amazon.com/x?a=1|Remediation>');
  });
});
