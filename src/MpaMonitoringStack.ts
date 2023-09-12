import { Stack } from "aws-cdk-lib";
import { OrgTrailMonitoring } from "./OrgTrailMonitoring";
import { Statics } from "./statics";

export class MpaMonitoringStack extends Stack {

  constructor(scope: any, id: string, props?: any) {
    super(scope, id, props);

    new OrgTrailMonitoring(this, 'orgtrail', {
      cloudTrailLogGroupName: Statics.orgTrailLogGroupName,
    });

  }

}