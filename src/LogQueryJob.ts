import { Duration, aws_events_targets as targets } from 'aws-cdk-lib';
import { CronOptions, Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { LogQueryJobFunction } from './LogQueryJob/LogQueryJob-function';
import { Statics } from './statics';

interface LogQueryJobProps {
  /**
   * prefix for named params, because multiple copies of this construct can exist in account
   */
  prefix: string;

  /**
   * The name of the current branch is used to obtain the right
   * configuration in the log query job lambda.
   */
  branchName: string;

  /**
   * Schedule for this job
   */
  schedule?: CronOptions;

  /**
   * The environments that are monitored and thus require access to
   * the role
   */
  deployToEnvironments: DeploymentEnvironment[];
}

export class LogQueryJob extends Construct {

  private envIndicator = '';

  constructor(scope: Construct, id: string, props: LogQueryJobProps) {
    super(scope, id);
    this.envIndicator = props.prefix;

    // Setup the job's role
    const role = this.setupLambdaRole();
    this.allowJobRoleToAssumeLogQueryRoles(role, props.deployToEnvironments);

    // Setup and schedule the job
    const resultsBucket = this.setupResultsBucket();
    const lambda = this.setupLogQueryJobFunction(role, props.branchName, resultsBucket);
    this.scheduleLogQueryJob(lambda, props);

  }

  /**
   * Creats the bucket where all log query results will be stored
   * @returns
   */
  setupResultsBucket() {
    const resultsBucket = new Bucket(this, 'log-query-results-bucket', {
      bucketName: `log-query-job-results-bucket-${this.envIndicator}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    return resultsBucket;
  }

  setupLambdaRole() {
    return new Role(this, 'log-query-job-role', {
      roleName: `log-query-job-role-${this.envIndicator}`,
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: `Role for log query job execution lambda (${this.envIndicator})`,
    });
  }

  /**
   * Allows the lambda role to assume the log query job roles in monitored accounts.
   * @param role
   * @param deploymentEnvironments
   */
  allowJobRoleToAssumeLogQueryRoles(role: Role, deploymentEnvironments: DeploymentEnvironment[]) {

    const accountsToQuery: string[] = [];
    deploymentEnvironments.forEach((env) => {
      if (env.queryDefinitons && env.env.account) {
        console.log(`Adding permission to assume the query logs role in ${env.env.account}`);
        accountsToQuery.push(env.env.account);
      }
    });

    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: { // only allow access to the accounts from the config
          'aws:ResourceAccount': accountsToQuery,
        },
      },
    }));

  }

  setupLogQueryJobFunction(role: Role, branchName: string, resultsBucket: Bucket) {

    const lambda = new LogQueryJobFunction(this, 'log-query-lambda', {
      role: role,
      environment: {
        LOG_QUERIES_RESULT_BUCKET_NAME: resultsBucket.bucketName,
        LOG_QUERY_ROLE_NAME: Statics.logQueryJobAccessRoleName,
        BRANCH_NAME: branchName,
      },
      timeout: Duration.minutes(14),
      description: `Log Query Job execution lambda (${this.envIndicator})`,
    });
    resultsBucket.grantWrite(lambda);

    for (const priority of Statics.monitoringPriorities) {
      const paramValue = StringParameter.valueForStringParameter(this, `${Statics.ssmSlackWebhookUrlPriorityPrefix}-${this.envIndicator}-${priority}`);
      lambda.addEnvironment(`SLACK_WEBHOOK_URL_${priority.toUpperCase()}`, paramValue);
    }

    return lambda;

  }

  scheduleLogQueryJob(lambda: IFunction, props: LogQueryJobProps) {

    const schedule = props.schedule ?? {
      hour: '4',
      minute: '0',
    };

    new Rule(this, 'log-query-lambda-trigger', {
      schedule: Schedule.cron(schedule),
      targets: [
        new targets.LambdaFunction(lambda, {
          retryAttempts: 2,
        }),
      ],
    });

  }


}
