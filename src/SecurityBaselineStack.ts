import { CustomResource } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { StackSetStack, StackSetStackProps } from 'cdk-stacksets';
import { Construct } from 'constructs';
import { EnableSsmDocShareProtectionFunction } from './CustomResources/SsmDocumentSharing/enableSsmDocShareProtection-function';


export class SecurityBaselineStack extends StackSetStack {

  /**
   * Sets properties in monitored accounts that stenghten the security baseline
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: StackSetStackProps) {
    super(scope, id, props);

    this.enableSsmDocumentSharingProtenction();


  }


  private enableSsmDocumentSharingProtenction() {

    const lambda = new EnableSsmDocShareProtectionFunction(this, 'ssm-doc-share-portection-function', {
      description: 'Custom resource for enableing ssm doc sharing protection in this account',
    });

    const customResourceProvider = new Provider(this, 'provider', {
      onEventHandler: lambda,
      logRetention: RetentionDays.ONE_MONTH,
    });

    new CustomResource(this, 'custom-resource', {
      serviceToken: customResourceProvider.serviceToken,
    });

  }

}