import { Stack, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudWatchInsightsQueryProps } from './LogQueryJob/Query';
import { Statics } from './statics';

interface LogQueryAccessRoleProps {
  queryDefinitions: CloudWatchInsightsQueryProps[];
}
/**
 * Define a new role to be assumed from the log query lambda function.
 *
 * The role allows access to cloudwatch logs (queries start, stop and get results),
 * and the log groups defined in the querydefinitions.
 * @param props
 */
export class LogQueryAccessRole extends Construct {
  constructor(scope: Construct, id: string, props: LogQueryAccessRoleProps) {
    super(scope, id);
    this.setupLogQueryJobAccess(props.queryDefinitions);
  }

  private setupLogQueryJobAccess(queryDefinitions: CloudWatchInsightsQueryProps[]) {
    const logGroupArns: string[] = this.logGroupArnsFromDefinition(queryDefinitions);

    const role = new iam.Role(this, 'log-query-job-access-role', {
      roleName: Statics.logQueryJobAccessRoleName,
      assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${Statics.gnAuditAccount}:role/log-query-job-lambda-role-dev`),
      description: 'Role to assume from the log query lambda function',
    });

    // Allow both the dev and prod lambas to assume this role
    role.grantAssumeRole(new iam.ArnPrincipal(`arn:aws:iam::${Statics.gnAuditAccount}:role/log-query-job-lambda-role-prod`));

    // Allow the role to use CloudWatch queries
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:GetQueryResults',
        'logs:StartQuery',
        'logs:StopQuery',
      ],
      resources: ['*'],
    }));

    // Provide the role access to the log groups that are queried
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:DescribeLogGroups',
        'logs:GetLogGroupFields',
        'logs:GetLogEvents',
      ],
      resources: logGroupArns,
    }));

  }

  private logGroupArnsFromDefinition(queryDefinitions: CloudWatchInsightsQueryProps[]) {
    const account = Stack.of(this).account;
    const region = Stack.of(this).region;
    const logGroupArns: string[] = [];

    queryDefinitions.forEach(queryDefinition => {
      queryDefinition.logGroupNames.forEach(logGroupName => {
        logGroupArns.push(`arn:aws:logs:${region}:${account}:log-group:${logGroupName}`);
        logGroupArns.push(`arn:aws:logs:${region}:${account}:log-group:${logGroupName}:*`);
      });
    });
    return logGroupArns;
  }
}
