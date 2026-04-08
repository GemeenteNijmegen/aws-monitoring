import { GetFindingsCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { handler } from '../SecurityHubOverview.lambda';

const securityHubMock = mockClient(SecurityHubClient);
let axiosMock: MockAdapter;

beforeAll(() => {
  process.env.BRANCH_NAME = 'main';
  process.env.SLACK_WEBHOOK_URL_HIGH = 'http://high.local.test';
});

beforeEach(() => {
  securityHubMock.reset();
  axiosMock = new MockAdapter(axios);
  axiosMock.onPost().reply(200, {});
});

function getSlackBlocks(): any[] {
  const data = JSON.parse(axiosMock.history.post[0].data);
  return data.blocks;
}

function makeFinding(overrides: Record<string, any> = {}) {
  return {
    Title: overrides.Title ?? 'Some finding',
    AwsAccountId: overrides.AwsAccountId ?? '740606269759',
    ProductName: overrides.ProductName ?? 'Inspector',
    Resources: overrides.Resources ?? [{ Type: 'AwsEc2Instance' }],
  };
}

function makeContainerFinding(overrides: Record<string, any> = {}) {
  return makeFinding({
    Title: 'Container CVE-2024-1234',
    ProductName: 'Inspector',
    Resources: [{ Type: 'AwsEcrContainerImage' }],
    ...overrides,
  });
}

function mockFindings(criticalFindings: any[], highFindings: any[]) {
  let callCount = 0;
  securityHubMock.on(GetFindingsCommand).callsFake(() => {
    callCount++;
    if (callCount === 1) return { Findings: criticalFindings };
    return { Findings: highFindings };
  });
}

describe('SecurityHub overview', () => {

  test('No findings shows all clear message', async () => {
    mockFindings([], []);
    await handler();

    const blocks = getSlackBlocks();
    expect(blocks).toHaveLength(2); // header + all clear
    expect(blocks[0].text.text).toContain('SecurityHub finding overview');
    expect(blocks[1].text.text).toContain('✅ No high or critical findings');
  });

  test('Critical non-container findings are listed individually', async () => {
    mockFindings(
      [makeFinding({ Title: 'Critical vuln 1' }), makeFinding({ Title: 'Critical vuln 2' })],
      [],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts).toContain('❗️ Critical findings');
    expect(texts.some((t: string) => t.includes('Critical vuln 1'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Critical vuln 2'))).toBe(true);
  });

  test('High non-container findings are listed individually', async () => {
    mockFindings(
      [],
      [makeFinding({ Title: 'High vuln 1' })],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts).toContain('⚠️ High findings');
    expect(texts.some((t: string) => t.includes('High vuln 1'))).toBe(true);
  });

  test('Container findings are counted, not listed individually', async () => {
    mockFindings(
      [
        makeFinding({ Title: 'Real critical finding' }),
        makeContainerFinding(),
        makeContainerFinding(),
        makeContainerFinding(),
      ],
      [],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts.some((t: string) => t.includes('Real critical finding'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Container CVE-2024-1234'))).toBe(false);
    expect(texts.some((t: string) => t.includes('3') && t.includes('critical findings') && t.includes('container images'))).toBe(true);
  });

  test('Only container findings shows count but no individual listings', async () => {
    mockFindings(
      [makeContainerFinding(), makeContainerFinding()],
      [makeContainerFinding()],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts.some((t: string) => t.includes('2') && t.includes('container images'))).toBe(true);
    expect(texts.some((t: string) => t.includes('1') && t.includes('container images'))).toBe(true);
    // No "all clear" message since there are findings
    expect(texts.some((t: string) => t.includes('✅'))).toBe(false);
  });

  test('Account name is resolved from deployment environments', async () => {
    mockFindings(
      [makeFinding({ Title: 'Test finding', AwsAccountId: '740606269759' })],
      [],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts.some((t: string) => t.includes('gn-mijn-nijmegen-prod'))).toBe(true);
  });

  test('Unknown account falls back to account id', async () => {
    mockFindings(
      [makeFinding({ Title: 'Test finding', AwsAccountId: '999999999999' })],
      [],
    );
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts.some((t: string) => t.includes('999999999999'))).toBe(true);
  });

  test('Pagination collects all findings', async () => {
    let callCount = 0;
    securityHubMock.on(GetFindingsCommand).callsFake(() => {
      callCount++;
      if (callCount === 1) {
        return { Findings: [makeFinding({ Title: 'Page 1 finding' })], NextToken: 'token1' };
      }
      if (callCount === 2) {
        return { Findings: [makeFinding({ Title: 'Page 2 finding' })] };
      }
      // High findings - empty
      return { Findings: [] };
    });
    await handler();

    const blocks = getSlackBlocks();
    const texts = blocks.map((b: any) => b.text.text);
    expect(texts.some((t: string) => t.includes('Page 1 finding'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Page 2 finding'))).toBe(true);
  });

  test('Error sends failure message to slack', async () => {
    securityHubMock.on(GetFindingsCommand).rejects(new Error('API error'));
    await handler();

    const blocks = getSlackBlocks();
    expect(blocks[0].text.text).toContain('Could not send SecurityHub overview to Slack');
  });

});
