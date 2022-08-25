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
      new MetricFilter(this, `assume-${role}-metric`, {
        logGroup,
        metricNamespace: 'Monitoring',
        metricName: 'OperatorRoleAssumed',
        filterPattern: FilterPattern.literal(`{ ($.eventName="AssumeRole") && ($.requestParameters.roleArn = "*${role}") }`),
        metricValue: '1',
      });
    });
  }

  private arrayWrappedString(stringOrArray: string | Array<string>) {
    if (typeof stringOrArray === 'string') {
      return [stringOrArray];
    }
    return stringOrArray;
  }
}
