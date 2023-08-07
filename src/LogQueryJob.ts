import { Duration, Stack, aws_events_targets as targets } from 'aws-cdk-lib';
import { CronOptions, Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyStatement, Role, ArnPrincipal } from 'aws-cdk-lib/aws-iam';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { deploymentEnvironments } from './DeploymentEnvironments';
import { LogQueryJobFunction } from './LogQueryJob/LogQueryJob-function';
import { Statics } from './statics';

interface LogQueryJobProps {
  /**
   * prefix for named params, because multiple copies of this construct can exist in account
   */
  prefix: string;

  /**
   * Schedule for this job
   */
  schedule?: CronOptions;
}

export class LogQueryJob extends Construct {

  constructor(scope: Construct, id: string, props: LogQueryJobProps) {
    super(scope, id);

    // We'll have to give this a proper name so we can reference it cross account
    // Note: this role is created later on, we use the arn to prevent circular dependencies between resrouces.
    const logQueryRoleArn = `arn:aws:iam::${Stack.of(this).account}:role/${Statics.logQueryJobRoleNamePrefix}${props.prefix}`;

    const resultsBucket = this.setupResultsBucket(props.prefix);
    const lambda = this.setupLogQueryJobFunction(props.prefix, resultsBucket, logQueryRoleArn);
    this.setupLogQueryJobRole(props.prefix, lambda);
    this.scheduleLogQueryJob(lambda, props);

  }

  /**
   * Creats the bucket where all log query results will be stored
   * @param prefix to differentiate between multiple copies of this construct
   * @returns
   */
  setupResultsBucket(prefix: string) {
    const resultsBucket = new Bucket(this, 'log-query-results-bucket', {
      bucketName: `${Statics.logQueryJobRoleNamePrefix}${prefix}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    return resultsBucket;
  }

  /**
   * Creats the role that will be used to run the log query job in different accounts.
   * Depending on the [DeploymentEnvironments]{@link ../DeploymentEnvironments.ts} the role is given
   * permission to call CloudWatch logs insights in each account.
   * @param prefix to differentiate between multiple copies of this construct
   * @param lambda the lambda that will be used to run the log query job (assumes this role)
   */
  setupLogQueryJobRole(prefix: string, lambda: IFunction) {

    if (!lambda.role) {
      throw new Error('Lambda does not have a role');
    }

    const role = new Role(this, 'log-query-role', {
      roleName: `log-query-job-role-${prefix}`,
      assumedBy: new ArnPrincipal(lambda.role.roleArn),
    });

    deploymentEnvironments.forEach((env) => {
      if (!env.queryDefinitons) {
        return;
      }

      console.log(`Adding permission to query logs in ${env.env.account}`);
      const allowGeneralCloudWatchAccess = new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'logs:GetQueryResults',
          'logs:StartQuery',
          'logs:StopQuery',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: { // only allow access to the accounts from the config
            'aws:ResourceAccount': [
              env.env.account,
            ],
          },
        },
      });
      role.addToPolicy(allowGeneralCloudWatchAccess);

      env.queryDefinitons.forEach((queryDef) => {

        const logGroupArns = queryDef.logGroupNames.map(name => `arn:aws:logs:${env.env.region}:${env.env.account}:log-group:${name}`);
        const logGroupContentsArns = logGroupArns.map(arn => `${arn}:*`);
        const allLogGroupArns = logGroupArns.concat(logGroupContentsArns);

        console.log(`Adding permission for logs query ${queryDef.name}`);
        const allowAccessToLogGroups = new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'logs:DescribeLogGroups',
            'logs:GetLogGroupFields',
            'logs:GetLogEvents',
          ],
          resources: allLogGroupArns,
        });
        role.addToPolicy(allowAccessToLogGroups);

      });
    });

    return role;
  }

  /**
   * Setup the lambda that will run the log query job.
   * @param prefix
   * @param resultsBucket
   * @param logQueryRoleArn
   * @returns
   */
  setupLogQueryJobFunction(prefix: string, resultsBucket: Bucket, logQueryRoleArn: string) {

    const lambda = new LogQueryJobFunction(this, 'log-query-lambda', {
      environment: {
        LOG_QUERIES_RESULT_BUCKET_NAME: resultsBucket.bucketName,
        LOG_QUERY_ROLE_ARN: logQueryRoleArn,
      },
      timeout: Duration.minutes(14),
      description: `Log Query Job execution lambda (${prefix})`,
    });
    resultsBucket.grantWrite(lambda);

    // Allow the lambda to assume the role that allows cross account query invocation
    lambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [logQueryRoleArn],
    }));

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
