import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { SlackbotFunction } from './slackbot/slackbot-function';

export interface AuditSupportProps {
  api: RestApi;
  /**
   * Used to separate environments (as it is all deplyed to the same AWS account)
   */
  environment: string;
}

export class AuditSupport extends Construct {

  constructor(scope: Construct, id: string, private readonly props: AuditSupportProps) {
    super(scope, id);
  }


  setupSlackCommands() {

    const slackSecret = new Secret(this, `slackbot-secret-${this.props.environment}`, {
      description: 'Secret for slackbot app',
    });

    const slackbot = new SlackbotFunction(this, 'slackbot', {
      description: 'Slackbot backend',
      environment: {
        SLACK_SECRET_ARN: slackSecret.secretArn,
      },
    });

    slackSecret.grantRead(slackbot);


    const slack = this.props.api.root.addResource('slackbot');
    slack.addMethod('POST', new LambdaIntegration(slackbot));
  }

}