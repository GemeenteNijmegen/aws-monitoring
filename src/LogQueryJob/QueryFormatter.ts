import { GetQueryResultsCommandOutput } from '@aws-sdk/client-cloudwatch-logs';


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

    const lines: string[] = [];
    response.results.forEach(logEvent => {
      const line = logEvent.map(field => field.value).join(' - ');
      lines.push(line);
    });
    return lines.join('\n');
  }

}