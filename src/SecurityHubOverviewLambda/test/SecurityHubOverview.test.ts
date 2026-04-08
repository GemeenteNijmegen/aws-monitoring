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

function allBlockTexts(blocks: any[]): string {
  return blocks.map((b: any) => b.text.text).join('\n');
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

  test('No findings sends only the header', async () => {
    mockFindings([], []);
    await handler();

    const blocks = getSlackBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text.text).toContain('SecurityHub finding overview');
  });

  test('Critical non-container findings are combined in a single block', async () => {
    mockFindings(
      [makeFinding({ Title: 'Critical vuln 1' }), makeFinding({ Title: 'Critical vuln 2' })],
      [],
    );
    await handler();

    const blocks = getSlackBlocks();
    // header + critical section header + critical findings block
    expect(blocks).toHaveLength(3);
    expect(blocks[1].text.text).toContain('❗️ Critical findings');
    expect(blocks[2].text.text).toContain('Critical vuln 1');
    expect(blocks[2].text.text).toContain('Critical vuln 2');
  });

  test('High non-container findings are combined in a single block', async () => {
    mockFindings(
      [],
      [makeFinding({ Title: 'High vuln 1' }), makeFinding({ Title: 'High vuln 2' })],
    );
    await handler();

    const blocks = getSlackBlocks();
    expect(blocks).toHaveLength(3);
    expect(blocks[1].text.text).toContain('⚠️ High findings');
    expect(blocks[2].text.text).toContain('High vuln 1');
    expect(blocks[2].text.text).toContain('High vuln 2');
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

    const text = allBlockTexts(getSlackBlocks());
    expect(text).toContain('Real critical finding');
    expect(text).not.toContain('Container CVE-2024-1234');
    expect(text).toContain('3');
    expect(text).toContain('critical findings');
    expect(text).toContain('container images');
  });

  test('Only container findings shows count but no individual listings', async () => {
    mockFindings(
      [makeContainerFinding(), makeContainerFinding()],
      [makeContainerFinding()],
    );
    await handler();

    const text = allBlockTexts(getSlackBlocks());
    expect(text).toContain('2');
    expect(text).toContain('1');
    expect(text).toContain('container images');
    expect(text).not.toContain('Container CVE-2024-1234');
  });

  test('Account name is resolved from deployment environments', async () => {
    mockFindings(
      [makeFinding({ Title: 'Test finding', AwsAccountId: '740606269759' })],
      [],
    );
    await handler();

    const text = allBlockTexts(getSlackBlocks());
    expect(text).toContain('gn-mijn-nijmegen-prod');
  });

  test('Unknown account falls back to account id', async () => {
    mockFindings(
      [makeFinding({ Title: 'Test finding', AwsAccountId: '999999999999' })],
      [],
    );
    await handler();

    const text = allBlockTexts(getSlackBlocks());
    expect(text).toContain('999999999999');
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
      return { Findings: [] };
    });
    await handler();

    const text = allBlockTexts(getSlackBlocks());
    expect(text).toContain('Page 1 finding');
    expect(text).toContain('Page 2 finding');
  });

  test('Findings block is truncated when exceeding max section length', async () => {
    const manyFindings = Array.from({ length: 50 }, (_, i) =>
      makeFinding({ Title: `Finding with a long title to fill up space number ${i}` }),
    );
    mockFindings(manyFindings, []);
    await handler();

    const blocks = getSlackBlocks();
    // The findings block should be replaced with the omitted message
    const findingsBlock = blocks[2].text.text;
    expect(findingsBlock).toBe('(message ommited)');
  });

  test('Error sends failure message to slack', async () => {
    securityHubMock.on(GetFindingsCommand).rejects(new Error('API error'));
    await handler();

    const blocks = getSlackBlocks();
    expect(blocks[0].text.text).toContain('Could not send SecurityHub overview to Slack');
  });

});
