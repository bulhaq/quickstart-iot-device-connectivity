import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import { CfnParameter, StackProps, RemovalPolicy } from "@aws-cdk/core";
import { Bucket } from "@aws-cdk/aws-s3";
import { Role, ServicePrincipal, ManagedPolicy } from "@aws-cdk/aws-iam";

//TODO: this will need to be removed after publication of teh quickstart
var GITHUB_TOKEN_SECRET_ID = "rollagrgithubtoken"

export class IotOnboardingCodePipelinesStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const region = (props && props.env) ? props.env.region : ""
    const account = (props && props.env) ? props.env.account : ""

    //const gitHubRepo = "aws-quickstart/quickstart-iot-device-connectivity"
    const gitHubRepo = "quickstart-iot-device-connectivity"

    //CloudFormatiion Input Parmetters to be provided by end user:
    const contactEmail = new CfnParameter(this, "contactEmail", {
      type: "String",
      allowedPattern: "^([a-zA-Z0-9_\\-\\.]+)@([a-zA-Z0-9_\\-\\.]+)\\.([a-zA-Z]{2,5})$",
      description: "A contact email address for the solution administrator"
    });
    const quickSightAdminUserName = new CfnParameter(this, "quickSightAdminUserName", {
      type: "String",
      description: "The Name of an existing Amin user created for Amazon Quicksihght (see quickstart guide). Omit this input if you do not want to deploy a QuickSight dashboard"
    });
    const quickSightAdminUserRegion = new CfnParameter(this, "quickSightAdminUserRegion", {
      type: "String",
      description: "The region where the existing Amin user was created for Amazon Quicksihght (see quickstart guide)"
    });
    const sourceTemplateArn = new CfnParameter(this, "sourceTemplateArn", {
      type: "String",
      description: "The Arn of a the source public template (see quickstart guide)"
    });
    const rootMqttTopic = new CfnParameter(this, "rootMqttTopic", {
      type: "String",
      allowedPattern: ".+",
      default: "data/#",
      description: "the root MQTT topic where onboarded devices publish (see quickstart guide)"
    });
    const envNameVal = new CfnParameter(this, "environment", {
      type: "String",
      allowedPattern: ".+",
      default: "int",
      description: "Environment name. Change only if you would like to deploy the same stack several time in the same region and account"
    });

    const artifactBucket = new Bucket(this, "iotOnboardingArtifacts", {
      //fix for issue with CF that generate the same name for the bucket encryption key
      bucketName: "iot-onboarding-artifacts-bucket-" + region + "-" + envNameVal.valueAsString,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: true
    })

    //TODO: provide a more granular access to the code build pipeline
    const buildProjectRole = new Role(this, 'buildRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")]
    })

    const infraBuild = new codebuild.PipelineProject(this, 'infraBuilProject', {
      projectName: "code-build-iot-onboarding-infra-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            "runtime-versions": {
              nodejs: 10
            },
            commands: [
              'echo "CodeBuild is running in $AWS_REGION" && aws configure set region $AWS_REGION',
              'npm install -g aws-cdk@1.91.0',
              'npm -g install typescript@4.2.2',
              'cdk --version',
              'cd iot-onboarding-infra',
              'npm install'
            ]
          },
          build: {
            commands: [
              'echo "Build and Deploy Infrastructure"',
              'pwd && sh deploy.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName + " " + rootMqttTopic.valueAsString + " " + contactEmail.valueAsString
            ],
          },
        },
        artifacts: {
          "discard-path": "yes",
          files: [
            'iot-onboarding-infra/infra-config-' + envNameVal.valueAsString + '.json',
          ],
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });

    const lambdaBuild = new codebuild.PipelineProject(this, 'lambdaBuilProject', {
      projectName: "code-build-iot-onboarding-lambda-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            "runtime-versions": {
              golang: 1.13
            }
          },
          build: {
            commands: [
              'echo "Build and Deploy lambda Function"',
              'cd iot-onboarding-service',
              'pwd && sh lbuild.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName
            ],
          },
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });

    const glueEtlBuild = new codebuild.PipelineProject(this, 'glueETLBuilProject', {
      projectName: "code-build-iot-onboarding-etl-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'echo "Uploading ETK script to s3"',
              'cd iot-onboarding-data-processing',
              'pwd && sh ./deploy.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName
            ],
          },
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });

    const siteWiseBuild = new codebuild.PipelineProject(this, 'siteWiseBuildProject', {
      projectName: "code-build-iot-onboarding-sitewise-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'echo "Building sitewise Assets model and project"',
              'cd iot-onboarding-sitewise',
              'pwd && sh ./sitewise.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName + " " + contactEmail.valueAsString
            ],
          },
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });

    const quicksightBuild = new codebuild.PipelineProject(this, 'quicksightBuildProject', {
      projectName: "code-build-iot-onboarding-quicksight-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'echo "Building Quicksight Dashboard"',
              'cd iot-onboarding-quicksight',
              'pwd && sh ./create-dashboard.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName + " " + quickSightAdminUserName.valueAsString + " " + sourceTemplateArn.valueAsString + " " + quickSightAdminUserRegion.valueAsString
            ],
          },
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });

    const onboardingTest = new codebuild.PipelineProject(this, 'testProject', {
      projectName: "code-build-iot-onboarding-test-" + envNameVal.valueAsString,
      role: buildProjectRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            "runtime-versions": {
              nodejs: 10
            },
            commands: [
              "yum -y install epel-release",
              "yum -y install mosquitto",
              "npm install -g newman@5.2.2"
            ]
          },
          build: {
            commands: [
              'echo "Testing Deployed on boarding service"',
              'cd e2e',
              'pwd && sh ./test.sh ' + envNameVal.valueAsString + " " + artifactBucket.bucketName
            ],
          },
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
      },
    });



    //Output Artifacts
    const sourceOutput = new codepipeline.Artifact();
    const cdkBuildOutputLambda = new codepipeline.Artifact('CdkBuildOutputLambda');
    const cdkBuildOutputETL = new codepipeline.Artifact('CdkBuildOutputETL');
    const cdkBuildOutputInfra = new codepipeline.Artifact('CdkBuildOutputInfra');
    const cdkBuildOutputTest = new codepipeline.Artifact('CdkBuildOutputTest');
    const siteWiseOutput = new codepipeline.Artifact('siteWiseOutput');
    const quickSightOutput = new codepipeline.Artifact('quickSightOutput');

    let stages: codepipeline.StageProps[] = []
    //Source  stage
    stages.push({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          repo: gitHubRepo,
          //TODO: this will need to be removed after publication of teh quickstart
          oauthToken: cdk.SecretValue.secretsManager(GITHUB_TOKEN_SECRET_ID),
          //TODO: remove this too
          branch: "feature/iot-quickstart-with-rigado",
          //TODO: channge this to aws-quickstart
          owner: 'grollat',
          output: sourceOutput,
        }),
      ],
    })
    //Build  stage
    stages.push({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'uploadELTScript',
          project: glueEtlBuild,
          input: sourceOutput,
          runOrder: 1,
          outputs: [cdkBuildOutputETL],
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'buildLambdaCode',
          project: lambdaBuild,
          input: sourceOutput,
          runOrder: 2,
          outputs: [cdkBuildOutputLambda],
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'deployInfra',
          project: infraBuild,
          input: sourceOutput,
          runOrder: 3,
          outputs: [cdkBuildOutputInfra],
        }),
      ],
    })
    //Test Stage
    stages.push({
      stageName: 'Test',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'testOnboardingService',
          project: onboardingTest,
          input: sourceOutput,
          outputs: [cdkBuildOutputTest],
        }),
      ],
    })
    //Deploy Stages
    let deployStage: codepipeline.StageProps = {
      stageName: 'Deploy',
      actions: [],
    }
    if (deployStage.actions) {
      deployStage.actions.push(new codepipeline_actions.S3DeployAction({
        actionName: "deployInfraConfigToS3",
        bucket: artifactBucket,
        runOrder: 1,
        input: cdkBuildOutputInfra
      }))
      //QuickSight dashboard is conditionally added if a Quicksight admin user is provided
      if (quickSightAdminUserName.valueAsString) {
        deployStage.actions.push(new codepipeline_actions.CodeBuildAction({
          actionName: 'setupQuicksight',
          project: quicksightBuild,
          input: sourceOutput,
          runOrder: 2,
          outputs: [quickSightOutput],
        }))
      }
      deployStage.actions.push(new codepipeline_actions.CodeBuildAction({
        actionName: 'setupSitewise',
        project: siteWiseBuild,
        input: sourceOutput,
        runOrder: 2,
        outputs: [siteWiseOutput],
      }))
    }
    stages.push(deployStage)

    new codepipeline.Pipeline(this, 'IotOnboardingPipeline', {
      pipelineName: "code-pipeline-iot-onboarding-" + envNameVal.valueAsString,
      stages: stages,
    });

  }

}








