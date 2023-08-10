import * as fs from 'fs';
import { QueryFormatter } from '../QueryFormatter';

test('Render html', () => {

  const mockedInput: any = [
    getMockQuery(),
    getMockQuery(),
  ];

  const html = QueryFormatter.renderAsHtmlReport(mockedInput);
  fs.writeFileSync('test-reports/test.html', html);

});


function getMockQuery() {
  return {
    settings: {
      name: 'mijn-nijmegen-test-query',
      region: 'eu-central-1',
      description: 'test query',
      logGroupNames: [
        '/aws/lambda/mijn-nijmegen-test-query',
        '/aws/lambda/mijn-nijmegen-test-query-2',
      ],
    },
    getResults() {
      return {
        results: [
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:18.427',
            },
            {
              field: '@message',
              value: JSON.stringify({
                some: 'fields',
                and: 'more',
                fields: 42,
              }),
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAMSNBoYAgZJgErcAAAAAIfrZnAABk0pTEAAAAPCIAEom7nbtJ0xMJu527SdMTgBQCZI+QVQqAIYACABEAAYAQ==',
            },
          ],
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:18.427',
            },
            {
              field: '@message',
              value: JSON.stringify({
                some: 'fields',
                and: 'more',
                fields: 42,
              }),
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAMSNBoYAgZJgErcAAAAAIfrZnAABk0pTEAAAAPCIAEom7nbtJ0xMJu527SdMTgBQCZI+QVQqAIYACABEAAYAQ==',
            },
          ],
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:14.528',
            },
            {
              field: '@message',
              value: 'test-10',
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAISNBoYAgZHsyv4AAAAA5JGOiwABk0pTWAAAAOCIAEotOfYtJ0xMOCa27SdMTgCQEtIswZQ4gIYACABEAEYAQ==',
            },
          ],
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:14.528',
            },
            {
              field: '@message',
              value: 'test-10',
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAISNBoYAgZHsyv4AAAAA5JGOiwABk0pTWAAAAOCIAEotOfYtJ0xMOCa27SdMTgCQEtIswZQ4gIYACABEAEYAQ==',
            },
          ],
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:14.528',
            },
            {
              field: '@message',
              value: 'test-10',
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAISNBoYAgZHsyv4AAAAA5JGOiwABk0pTWAAAAOCIAEotOfYtJ0xMOCa27SdMTgCQEtIswZQ4gIYACABEAEYAQ==',
            },
          ],
          [
            {
              field: '@timestamp',
              value: '2023-08-08 19:19:14.528',
            },
            {
              field: '@message',
              value: 'test-10',
            },
            {
              field: '@ptr',
              value: 'ClsKHwobMDk1Nzk4MjQ5MzE3OnRlc3QtbG9nLWdyb3VwEAISNBoYAgZHsyv4AAAAA5JGOiwABk0pTWAAAAOCIAEotOfYtJ0xMOCa27SdMTgCQEtIswZQ4gIYACABEAEYAQ==',
            },
          ],
        ],
      };
    },
  };
}