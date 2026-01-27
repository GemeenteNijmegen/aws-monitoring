const { GemeenteNijmegenCdkApp } = require('@gemeentenijmegen/projen-project-type');
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'aws-monitoring',
  depsUpgradeOptions: {
    workflowOptions: {
      branches: ['sandbox'],
      labels: ['auto-merge'],
    },
  },
  deps: [
    '@gemeentenijmegen/aws-constructs',
    '@gemeentenijmegen/utils',
    'aws-cdk-lib',
    'constructs',
    'cdk-nag',
    'axios',
    '@types/aws-lambda',
    '@aws-cdk/aws-apigatewayv2-alpha',
    '@aws-cdk/aws-apigatewayv2-integrations-alpha',
    '@aws-sdk/client-sqs',
    '@aws-sdk/client-securityhub',
    '@aws-sdk/client-organizations',
    '@aws-sdk/client-cloudwatch-logs',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sts',
    '@aws-sdk/client-sns',
    'cdk-stacksets',
    '@gemeentenijmegen/projen-project-type',
  ],
  devDeps: [
    'axios-mock-adapter',
    'aws-sdk-client-mock',
  ],
  /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
