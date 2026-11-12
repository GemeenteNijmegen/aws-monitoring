import { AwsSecurityFinding } from '@aws-sdk/client-securityhub';
import { getEventFromFilePath } from './util';
import { viewFromFinding, viewFromPayload } from '../SecurityHubView';

describe('viewFromPayload', () => {
  test('maps the SNS securityhub sample', async () => {
    const event = await getEventFromFilePath('samples/securityhub-new-lz.json');
    const payload = JSON.parse(event.Records[0].Sns.Message);
    const view = viewFromPayload(payload);
    expect(view.title.startsWith('CodeBuild.5')).toBe(true);
    expect(view.severity).toBe('HIGH');
    expect(view.accountId).toBe('836443378780');
    expect(view.region).toBe('eu-central-1');
    expect(view.controlId).toBe('CodeBuild.5');
    expect(view.complianceStatus).toBe('FAILED');
    expect(view.workflowStatus).toBe('NEW');
    expect(view.standard).toBe('aws-foundational-security-best-practices/v/1.0.0');
    expect(view.resources).toHaveLength(1);
    expect(view.findingId).toBeUndefined();
  });

});

describe('viewFromFinding', () => {
  const base: AwsSecurityFinding = {
    Id: 'arn:aws:securityhub:eu-central-1:111111111111:finding/abc',
    ProductArn: 'arn:aws:securityhub:eu-central-1::product/aws/inspector',
    AwsAccountId: '111111111111',
    Title: 'CVE-2024-0001 - openssl',
    Workflow: { Status: 'NEW' },
    Remediation: { Recommendation: { Url: 'https://example.test/fix' } },
  } as AwsSecurityFinding;

  test('maps an Inspector-like finding', () => {
    const view = viewFromFinding({
      ...base,
      Vulnerabilities: [{ FixAvailable: 'NO' }, { FixAvailable: 'YES', ExploitAvailable: 'NO' }],
    } as AwsSecurityFinding);
    expect(view.fixAvailable).toBe('YES');
    expect(view.exploitAvailable).toBe('NO');
    expect(view.findingId).toBe(base.Id);
    expect(view.productArn).toBe(base.ProductArn);
    expect(view.remediationUrl).toBe('https://example.test/fix');
    expect(view.accountId).toBe('111111111111');
    expect(view.workflowStatus).toBe('NEW');
    expect(view.controlId).toBeUndefined();
  });

  test('prefers PARTIAL over NO', () => {
    const view = viewFromFinding({
      ...base,
      Vulnerabilities: [{ FixAvailable: 'NO' }, { FixAvailable: 'PARTIAL' }],
    } as AwsSecurityFinding);
    expect(view.fixAvailable).toBe('PARTIAL');
  });

  test('leaves fix/exploit undefined without Vulnerabilities', () => {
    const view = viewFromFinding(base);
    expect(view.fixAvailable).toBeUndefined();
    expect(view.exploitAvailable).toBeUndefined();
  });
});
