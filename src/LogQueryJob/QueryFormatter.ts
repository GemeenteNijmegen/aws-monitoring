import { GetQueryResultsCommandOutput } from '@aws-sdk/client-cloudwatch-logs';
import Mustache from 'mustache';
import { CloudWatchInsightsQuery } from './Query';
import * as htmlTemplate from './template/template.mustache';

export interface QueryFormatterLine {
  timestamp: string;
  message: string;
}

export class QueryFormatter {

  /**
   * Formats the CloudWatch query results into a string.
   * @param response
   * @returns
   */
  static format(response: GetQueryResultsCommandOutput): string {
    if (!response.results) {
      return '';
    }
    return QueryFormatter.formatedLines(response).map(line => `${line.timestamp} - ${line.message}`).join('\n');
  }

  /**
   * Formats the CloudWatch query results into a list of strings.
   * @param response
   * @returns
   */
  static formatedLines(response?: GetQueryResultsCommandOutput): QueryFormatterLine[] {
    if (!response || !response.results) {
      return [];
    }

    const lines: QueryFormatterLine[] = [];
    response.results.forEach(logEvent => {

      const line: QueryFormatterLine = {
        timestamp: '',
        message: '',
      };

      const fields: string[] = [];
      logEvent.forEach(field => {
        if (field.value && field.field != '@ptr' && field.field != '@timestamp') {
          fields.push(field.value);
        }
        if (field.value && field.field == '@timestamp') {
          line.timestamp = field.value;
        }
      });
      line.message = fields.join(' - ');

      lines.push(line);
    });
    return lines;
  }

  static renderAsHtmlReport(queries: CloudWatchInsightsQuery[]) {
    const timestamp = new Date().toISOString();
    const formattedQueries = queries.map(query => {
      return {
        name: query.settings.name,
        description: query.settings.description,
        region: query.settings.region,
        start: query.settings.startTime ?? '1 week ago',
        end: query.settings.endTime ?? timestamp,
        logs: query.settings.logGroupNames.map(log => { return { name: log }; }),
        lines: QueryFormatter.formatedLines(query.getResults()),
      };
    });

    const html = Mustache.render(htmlTemplate.default, { queries: formattedQueries });
    return html;
  }

}