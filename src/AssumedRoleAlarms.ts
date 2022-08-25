import { RemovalPolicy } from 'aws-cdk-lib';
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';


export interface AssumedRoleAlarmsProps {
  cloudTrailLogGroupName: string;
  roles: string | string[];
}

export class AssumedRoleAlarms extends Construct {
  constructor(scope: Construct, id: string, props: AssumedRoleAlarmsProps) {
    super(scope, id);
    this.alarmOnAssumedRoles(props.roles, props.cloudTrailLogGroupName);
  }

  private alarmOnAssumedRoles(roles: string | string[], cloudTrailLogGroupName: string) {
    const logGroup = LogGroup.fromLogGroupName(this, 'cloudtrail', cloudTrailLogGroupName);
    const rolesArray = this.arrayWrappedString(roles);

    rolesArray.forEach(role => {
      const filter = new MetricFilter(this, `assume-${role}-metric`, {
        logGroup,
        metricNamespace: 'Monitoring',
        metricName: `${role}RoleAssumed`,
        filterPattern: FilterPattern.literal(`{ ($.eventName="AssumeRole") && ($.requestParameters.roleArn = "*${role}") }`),
        metricValue: '1',
      });
      filter.applyRemovalPolicy(RemovalPolicy.DESTROY);

      const alarm = new Alarm(this, `assume-${role}-alarm`, {
        metric: filter.metric({
          statistic: 'sum',
        }),
        evaluationPeriods: 1,
        threshold: 1,
        alarmName: `Role ${role} was assumed`,
        alarmDescription: `This alarm triggers if the role ${role} is assumed by any user. This role has more priviliges than normal use require, so when it is assumed it's use should be logged and explained.`,
      });
      alarm.applyRemovalPolicy(RemovalPolicy.DESTROY);
    });
  }

  private arrayWrappedString(stringOrArray: string | Array<string>) {
    if (typeof stringOrArray === 'string') {
      return [stringOrArray];
    }
    return stringOrArray;
  }
}
