import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Aspects, Stack, Stage, StageProps, Tags } from 'aws-cdk-lib';
import { Role } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { Capability, DeploymentType, StackSet, StackSetTarget, StackSetTemplate } from 'cdk-stacksets';
import { Construct } from 'constructs';
import { DeploymentEnvironment } from './DeploymentEnvironments';
import { SecurityBaselineStack } from './SecurityBaselineStack';
import { Statics } from './statics';

export interface AccountSetupStageProps extends StageProps {
  deployToEnvironments: DeploymentEnvironment[];
}

export class AccountSetupStage extends Stage {

  constructor(scope: Construct, id: string, props: AccountSetupStageProps) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    // Filter on environment.monitor is false (defaults to true)
    const deploymentEnvironments = props.deployToEnvironments.filter(environment => environment.monitor !== false);

    const stack = new Stack(this, 'securitybaselinestack');
    const assetBucket = new Bucket(stack, 'security-baseline-stack-assets', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    const securityBaselineStack = new SecurityBaselineStack(stack, 'security-baseline-stack', {
      assetBuckets: [assetBucket],
      assetBucketPrefix: 'security-baseline-stack',
    });
    const stackset = new StackSet(stack, 'StackSet', {
      target: StackSetTarget.fromAccounts({
        regions: ['eu-central-1'],
        accounts: deploymentEnvironments.map(environment => environment.env.account).filter(account => account) as string[],
      }),
      deploymentType: DeploymentType.selfManaged({
        adminRole: Role.fromRoleName(stack, 'cdkrole', 'cdk-hnb659fds-cfn-exec-role-836443378780-eu-central-1'),
      }),
      template: StackSetTemplate.fromStackSetStack(securityBaselineStack),
      capabilities: [Capability.NAMED_IAM],
      operationPreferences: {
        maxConcurrentPercentage: 100,
        maxConcurrentCount: 99,
      },
    });

    stackset.node.addDependency(assetBucket);
    securityBaselineStack.node.addDependency(assetBucket);

  }
}
