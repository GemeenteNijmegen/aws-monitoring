import { BatchUpdateFindingsCommand, GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import { SuppressJob } from '../../shared/ActionPayload';
import { handleRecords, SuppressWorker } from '../SuppressWorker';

const securityHubMock = mockClient(SecurityHubClient);

const job: SuppressJob = {
  id: 'finding-1',
  productArn: 'arn:aws:securityhub:eu-central-1::product/aws/securityhub',
  responseUrl: 'https://hooks.slack.com/actions/T1/B1/xyz',
  slackUserId: 'U123',
  reason: 'accepted risk',
};

function finding(overrides: any = {}) {
  return {
    Id: job.id,
    ProductArn: job.productArn,
    Title: 'Some title',
    AwsAccountId: '111111111111',
    Region: 'eu-central-1',
    Severity: { Label: 'CRITICAL' },
    Workflow: { Status: 'NEW' },
    Resources: [],
    ...overrides,
  };
}

function setup(opts: { members?: string[]; membersError?: boolean } = {}) {
  const respond = jest.fn().mockResolvedValue(undefined);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const slack = {
    listGroupMembers: opts.membersError
      ? jest.fn().mockRejectedValue(new Error('slack down'))
      : jest.fn().mockResolvedValue(opts.members ?? ['U123']),
  };
  const worker = new SuppressWorker({
    slack,
    securityHub: new SecurityHubClient({}),
    respond,
    userGroupId: 'S1',
    accountNameFor: (id: string) => `name-${id}`,
    logger,
  });
  return { worker, respond, logger, slack };
}

function hasActions(body: any): boolean {
  return (body.blocks ?? []).some((b: any) => b.type === 'actions');
}

function writes() {
  return securityHubMock.commandCalls(BatchUpdateFindingsCommand);
}

beforeEach(() => {
  securityHubMock.reset();
  securityHubMock.on(BatchUpdateFindingsCommand).resolves({ UnprocessedFindings: [] });
});

describe('SuppressWorker', () => {
  test('refuses non-member', async () => {
    const { worker, respond, slack } = setup({ members: ['U999'] });
    expect(await worker.handle(job)).toBe('not-allowed');
    expect(slack.listGroupMembers).toHaveBeenCalledWith('S1');
    expect(securityHubMock.commandCalls(GetFindingsCommand)).toHaveLength(0);
    expect(writes()).toHaveLength(0);
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond.mock.calls[0][1]).toMatchObject({ response_type: 'ephemeral', replace_original: false });
    expect(typeof respond.mock.calls[0][1].text).toBe('string');
  });

  test('fails closed on Slack error', async () => {
    const { worker } = setup({ membersError: true });
    expect(await worker.handle(job)).toBe('not-allowed');
    expect(securityHubMock.commandCalls(GetFindingsCommand)).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });

  test('refuses not found', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [] });
    const { worker, respond } = setup();
    expect(await worker.handle(job)).toBe('not-found');
    expect(writes()).toHaveLength(0);
    expect(respond.mock.calls[0][1]).toMatchObject({ response_type: 'ephemeral', replace_original: false });
  });

  test('looks up by Id and ProductArn', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    const { worker } = setup();
    await worker.handle(job);
    const input = securityHubMock.commandCalls(GetFindingsCommand)[0].args[0].input;
    expect(input.Filters).toEqual({
      Id: [{ Comparison: 'EQUALS', Value: job.id }],
      ProductArn: [{ Comparison: 'EQUALS', Value: job.productArn }],
    });
  });

  test('refuses non-critical', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding({ Severity: { Label: 'HIGH' } })] });
    const { worker } = setup();
    expect(await worker.handle(job)).toBe('not-critical');
    expect(writes()).toHaveLength(0);
  });

  test('refuses stale finding', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({
      Findings: [finding({ Workflow: { Status: 'RESOLVED' }, Note: { UpdatedBy: 'slack:U777', Text: 'fixed it' } })],
    });
    const { worker, respond } = setup();
    expect(await worker.handle(job)).toBe('stale');
    expect(writes()).toHaveLength(0);
    const ephemeral = respond.mock.calls.find(c => c[1].response_type === 'ephemeral')![1];
    expect(ephemeral.text).toContain('RESOLVED');
    expect(ephemeral.text).toContain('fixed it');
    expect(ephemeral.text).toContain('<@U777>');
    const redraw = respond.mock.calls.find(c => c[1].replace_original === true)![1];
    expect(hasActions(redraw)).toBe(false);
  });

  test('already suppressed', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({
      Findings: [finding({ Workflow: { Status: 'SUPPRESSED' }, Note: { UpdatedBy: 'someone', Text: 'dup' } })],
    });
    const { worker, respond } = setup();
    expect(await worker.handle(job)).toBe('already-suppressed');
    expect(writes()).toHaveLength(0);
    const redraw = respond.mock.calls.find(c => c[1].replace_original === true)![1];
    expect(hasActions(redraw)).toBe(false);
  });

  test('suppresses', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding({ Workflow: { Status: 'NOTIFIED' } })] });
    const { worker, respond, logger } = setup();
    const reason = 'r'.repeat(400);
    expect(await worker.handle({ ...job, reason })).toBe('suppressed');
    expect(writes()).toHaveLength(1);
    const input = writes()[0].args[0].input;
    expect(input).toEqual({
      FindingIdentifiers: [{ Id: job.id, ProductArn: job.productArn }],
      Workflow: { Status: 'SUPPRESSED' },
      Note: { Text: expect.any(String), UpdatedBy: 'slack:U123' },
    });
    expect(input.Note!.Text!.length).toBeLessThanOrEqual(512);
    expect(input.Note!.Text).toContain('U123');
    expect(input.Note!.Text).toContain('r'.repeat(100));
    const redraw = respond.mock.calls[0][1];
    expect(redraw.replace_original).toBe(true);
    expect(hasActions(redraw)).toBe(false);
    const text = JSON.stringify(redraw);
    expect(text).toContain('SUPPRESSED');
    expect(text).toContain('<@U123>');
    expect(text).toContain(reason);
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain(job.id);
    expect(logged).toContain('U123');
    expect(logged).not.toContain(reason);
  });

  test('escapes reason', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    const { worker, respond } = setup();
    await worker.handle({ ...job, reason: '<!channel> & <@U9>' });
    const text = JSON.stringify(respond.mock.calls[0][1]);
    expect(text).toContain('&lt;!channel&gt; &amp; &lt;@U9&gt;');
    expect(text).not.toContain('<!channel>');
    expect(text).not.toContain('<@U9>');
  });

  test('UnprocessedFindings returns failed', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    securityHubMock.on(BatchUpdateFindingsCommand).resolves({
      UnprocessedFindings: [{ FindingIdentifier: { Id: job.id, ProductArn: job.productArn }, ErrorCode: 'x', ErrorMessage: 'y' }],
    });
    const { worker, respond } = setup();
    expect(await worker.handle(job)).toBe('failed');
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond.mock.calls[0][1]).toMatchObject({ response_type: 'ephemeral', replace_original: false });
  });

  test('rejected BatchUpdateFindings returns failed', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    securityHubMock.on(BatchUpdateFindingsCommand).rejects(new Error('boom'));
    const { worker, respond } = setup();
    expect(await worker.handle(job)).toBe('failed');
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond.mock.calls[0][1]).toMatchObject({ response_type: 'ephemeral', replace_original: false });
  });

  test('survives expired response_url', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    const { worker, respond, logger } = setup();
    respond.mockRejectedValue(new Error('expired'));
    expect(await worker.handle(job)).toBe('suppressed');
    expect(writes()).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
  });

  test('refuses non-slack response_url', async () => {
    securityHubMock.on(GetFindingsCommand).resolves({ Findings: [finding()] });
    for (const url of [
      'https://evil.example.com/x',
      'http://hooks.slack.com/x',
      'https://hooks.slack.com.evil.com/x',
      'https://hooks.slack.com@evil.com/x',
      'not a url',
    ]) {
      const { worker, respond, logger } = setup();
      expect(await worker.handle({ ...job, responseUrl: url })).toBe('suppressed');
      expect(writes().length).toBeGreaterThan(0);
      expect(respond).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(url);
      securityHubMock.resetHistory();
    }
  });

  test('does not turn a hostile note author into markup', async () => {
    for (const author of ['slack:U1> <!channel', 'slack:x|y> <https://evil|Click here', 'slack:U1>']) {
      securityHubMock.on(GetFindingsCommand).resolves({
        Findings: [finding({ Workflow: { Status: 'RESOLVED' }, Note: { UpdatedBy: author, Text: 't' } })],
      });
      const { worker, respond } = setup();
      await worker.handle(job);
      const text = JSON.stringify(respond.mock.calls);
      expect(text).not.toContain('<!channel>');
      expect(text).not.toContain('<https://evil');
      expect(text).not.toContain('<@U1>');
      expect(text).toMatch(/&(lt|gt);/);
    }
  });
});

describe('handleRecords', () => {
  const record = (body: string, messageId = 'm') => ({ messageId, body });

  test('isolates bad records and keeps processing', async () => {
    const handle = jest.fn()
      .mockRejectedValueOnce(new Error('boom reason-secret'))
      .mockResolvedValue('suppressed');
    const logger = { error: jest.fn() };
    const { reason, ...noReason } = job;
    await expect(handleRecords([
      record('{not json', 'm1'),
      record(JSON.stringify(noReason), 'm2'),
      record(JSON.stringify(job), 'm3'),
      record(JSON.stringify(job), 'm4'),
    ], { handle }, logger)).resolves.toBeUndefined();
    expect(handle).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(3);
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).toContain('m1');
    expect(logged).not.toContain(reason);
    expect(logged).not.toContain('hooks.slack.com');
    expect(logged).not.toContain('secret');
  });
});
