const { GemeenteNijmegenCdkApp } = require('@gemeentenijmegen/projen-project-type');
const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'aws-monitoring',
  depsUpgradeOptions: {
    workflowOptions: {
      branches: ['development'],
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
    '@aws-sdk/client-cloudwatch-logs',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sts',
    'mustache',
    '@types/mustache',
  ],
  devDeps: [
    '@gemeentenijmegen/projen-project-type',
    'axios-mock-adapter',
    '@glen/jest-raw-loader',
  ],
  bundlerOptions: {
    loaders: {
      mustache: 'text',
    },
  },
  jestOptions: {
    jestConfig: {
      moduleFileExtensions: [
        'js', 'json', 'jsx', 'ts', 'tsx', 'node', 'mustache',
      ],
      transform: {
        '\\.[jt]sx?$': 'ts-jest',
        '^.+\\.mustache$': '@glen/jest-raw-loader',
      },
      testPathIgnorePatterns: ['/node_modules/', '/cdk.out'],
      roots: ['src', 'test'],
    },
  },
});
project.synth();