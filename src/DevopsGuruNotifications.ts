import { aws_devopsguru, aws_iam, aws_kms, aws_sns } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface DevopsGuruNotificationsProps {
  topic: aws_sns.Topic;
  topicKey: aws_kms.Key;
}
export class DevopsGuruNotifications extends Construct {
  /**
   * Add a notification channel to devopsguru which sends notifications to the
   * provided SNS topic.
   */
  constructor(scope: Construct, id: string, props: DevopsGuruNotificationsProps) {
    super(scope, id);

    new aws_devopsguru.CfnResourceCollection(this, 'CfnResourceCollection', {
      resourceCollectionFilter: {
        cloudFormation: {
          stackNames: ['*'],
        },
      },
    });

    new aws_devopsguru.CfnNotificationChannel(this, 'notification-channel', {
      config: {
        sns: {
          topicArn: props.topic.topicArn,
        },
      },
    });

    props.topicKey.addToResourcePolicy(new aws_iam.PolicyStatement({
      effect: aws_iam.Effect.ALLOW,
      principals: [new aws_iam.ServicePrincipal('eu-central-1.devops-guru.amazonaws.com')],
      actions: [
        'kms:GenerateDataKey*',
        'kms:Decrypt',
      ],
      resources: ['*'], // Wildcard '*' required
    }));
  }
}
