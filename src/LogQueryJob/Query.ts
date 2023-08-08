import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
} from '@aws-sdk/client-cloudwatch-logs';

export interface CloudWatchInsightsQueryProps {

  /**
   * A name for this query
   */
  name: string;

  /**
   * A description of this query and results
   */
  description: string;

  /**
   * The logs insights query string
   */
  queryString: string;

  /**
   * The loggroups to query
   */
  logGroupNames: string[];

  /**
   * Begin of time range to query.
   * @default - 1 week ago
   */
  startTime?: number;

  /**
   * End of time range to query.
   * @default - now
   */
  endTime?: number;

  /**
   * Which AWS region to execute the query.
   */
  region: string;

  /**
   * Define a maximum timeout (seconds) for query results.
   * @default 30 secibds
   */
  queryResultTimeout?: number;
}

export class CloudWatchInsightsQuery {

  private static MILIS_1_WEEK = 1000 * 60 * 60 * 24 * 7;

  readonly settings: CloudWatchInsightsQueryProps;
  private client: CloudWatchLogsClient;
  private queryId?: string;
  private result?: GetQueryResultsCommandOutput;

  constructor(settings: CloudWatchInsightsQueryProps, client: CloudWatchLogsClient) {
    this.settings = settings;
    this.settings.startTime = this.settings.startTime ?? new Date(new Date().getTime() - CloudWatchInsightsQuery.MILIS_1_WEEK).getTime() / 1000;
    this.settings.endTime = this.settings.endTime ?? new Date().getTime() / 1000 ;
    this.client = client;
  }

  /**
   * Run the query and wait for results.
   */
  async run() {
    const timeout = this.settings.queryResultTimeout ?? 30;
    let attempts = 0;

    try {
      await this.start();
      await this.sleep(1000);

      let done = await this.checkResults();
      while (!done && attempts < timeout) {
        attempts++;
        done = await this.checkResults();
        if (!done) {
          await this.sleep(1000);
        }
      }
    } catch (error) {
      console.error(error);
      throw Error('Could not execute query');
    }
  }

  /**
   * Get the query results.
   * @returns - query results
   */
  getResults() {
    return this.result;
  }

  /**
   * Call startqeury on cloudwatch
   */
  private async start() {
    try {
      const startQuery = new StartQueryCommand({
        queryString: this.settings.queryString,
        logGroupNames: this.settings.logGroupNames,
        startTime: this.settings.startTime,
        endTime: this.settings.endTime,
      });
      const query = await this.client.send(startQuery);
      if (!query.queryId) {
        throw Error('No query ID returned');
      }
      this.queryId = query.queryId;
    } catch ( error ) {
      console.error(error);
      throw Error('Could not start query');
    }
  }

  /**
   * Calls the CloudWatch API to check the status of the query.
   * @returns true if results are in, false otherwise
   */
  private async checkResults() {
    const queryResult = new GetQueryResultsCommand({
      queryId: this.queryId,
    });
    const result = await this.client.send(queryResult);
    if (result.status === 'Complete') {
      this.result = result;
    }
    return this.result != undefined;
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}
