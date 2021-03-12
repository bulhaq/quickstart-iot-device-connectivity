#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { IOTOnboardingInfraStack } from '../lib/iot-onboarding-infra-stack';
import { Tag } from "@aws-cdk/core";

const app = new cdk.App();
const envName = app.node.tryGetContext("envName");

let stack = new IOTOnboardingInfraStack(app, 'IOTOnboardingInfraStack' + envName, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,

    },
    description: "Deploys the IoT Device connectivity pipeline to run the CDK deployment (qs-1rmapn8de)",
});
stack.templateOptions.metadata = { "QuickStartDocumentation": { EntrypointName: "Launch Deployment Pipeline" } }


/**************
 * Tagging all resources in stack
 */
Tag.add(stack, 'application-name', 'iot-onboarding');
Tag.add(stack, 'application-env', envName);

app.synth();
