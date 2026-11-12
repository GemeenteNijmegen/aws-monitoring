import { GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import { SecurityHubFindingLookup } from '../SecurityHubFindingLookup';
import critical from './samples/securityhub-critical.json';

const securityHubMock = mockClient(SecurityHubClient);
const payload = () => JSON.parse(critical.Records[0].Sns.Message);
const lookup = new SecurityHubFindingLookup(new SecurityHubClient({}));

beforeEach(() => {
  securityHubMock.reset();
});

describe('SecurityHubFindingLookup', () => {
  test('one match', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [{ Id: 'f1' } as any] });
    const result = await lookup.lookup(payload());
    expect(result).toEqual({ Id: 'f1' });
    const input = securityHubMock.commandCalls(GetFindingsCommand)[0].args[0].input;
    expect(input.MaxResults).toBe(2);
    expect(input.Filters).toEqual({
      AwsAccountId: [{ Comparison: 'EQUALS', Value: '836443378780' }],
      ResourceId: [{ Comparison: 'EQUALS', Value: 'arn:aws:codebuild:eu-central-1:836443378780:project/geostoragemainPipelineBuild-fc35zxwLlDEN' }],
      RecordState: [{ Comparison: 'EQUALS', Value: 'ACTIVE' }],
      SeverityLabel: [{ Comparison: 'EQUALS', Value: 'CRITICAL' }],
      ComplianceSecurityControlId: [{ Comparison: 'EQUALS', Value: 'CodeBuild.5' }],
    });
  });

  test('title fallback', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [{ Id: 'f1' } as any] });
    const p = payload();
    delete p.ControlId;
    await lookup.lookup(p);
    const filters = securityHubMock.commandCalls(GetFindingsCommand)[0].args[0].input.Filters!;
    expect(filters.ComplianceSecurityControlId).toBeUndefined();
    expect(filters.Title).toEqual([{ Comparison: 'EQUALS', Value: p.Title }]);
  });

  test.each([
    ['zero matches', () => securityHubMock.on(GetFindingsCommand).resolves({ Findings: [] })],
    ['multiple matches', () => securityHubMock.on(GetFindingsCommand).resolves({ Findings: [{ Id: 'a' } as any, { Id: 'b' } as any] })],
    ['api error', () => securityHubMock.on(GetFindingsCommand).rejects(new Error('boom'))],
  ])('%s gives undefined', async (_name, arrange) => {
    jest.spyOn(console, 'error').mockImplementation();
    arrange();
    expect(await lookup.lookup(payload())).toBeUndefined();
  });

  test('no resources gives undefined without calling the api', async () => {
    const p = payload();
    p.Resources = [];
    expect(await lookup.lookup(p)).toBeUndefined();
    expect(securityHubMock.commandCalls(GetFindingsCommand)).toHaveLength(0);
  });
});
