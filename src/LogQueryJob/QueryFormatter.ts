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
      const fields: string[] = [];
      logEvent.forEach(field => {
        if(field.value && field.value != '@ptr'){
          fields.push(field.value);
        }
      })
      const line = fields.join(' - ');
      lines.push(line);
    });
    return lines.join('\n');
  }

}