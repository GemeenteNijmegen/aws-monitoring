import { Stack, Stage } from 'aws-cdk-lib';
import { OrgTrailMonitoring } from './OrgTrailMonitoring';
import { Statics } from './statics';

export class MpaMonitoringStage extends Stage {
  constructor(scope: any, id: string, props?: any) {
    super(scope, id, props);
    new MpaMonitoringStack(this, 'stack', {
      env: props.env,
    });
  }
}

export class MpaMonitoringStack extends Stack {
  constructor(scope: any, id: string, props?: any) {
    super(scope, id, props);
    new OrgTrailMonitoring(this, 'orgtrail', {
      cloudTrailLogGroupName: Statics.orgTrailLogGroupName,
    });
  }
}