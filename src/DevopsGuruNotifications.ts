import { aws_devopsguru } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class DevopsGuruMonitoring extends Construct {
  /**
   * Add a resource collection to DevOpsGuru which will watch all CloudFormation stacks.
   * Notifications are pickedup from EventBridge.
   */
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new aws_devopsguru.CfnResourceCollection(this, 'CfnResourceCollection', {
      resourceCollectionFilter: {
        cloudFormation: {
          stackNames: ['*'],
        },
      },
    });

  }
}
