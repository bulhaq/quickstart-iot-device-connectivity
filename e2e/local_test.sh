#!/bin/sh

env=LOCAL
bucket=DOESNT_MATTER
#update this variable to specify the name of your loval env
LOCAL_ENV_NAME=dev

echo "**********************************************"
echo "* Testing IOT onboarding Quickstart in env '$env' "
echo "***********************************************"
if [ -z "$env" ] || [ -z "$bucket" ]
then
    echo "Environment Must not be Empty"
    echo "Usage:"
    echo "sh deploy.sh <env> <bucket>"
else

echo "1. getting infra configuration for environement $env"
# aws s3 cp s3://$bucket/infra-config-$env.json infra-config.json
jq . infra-config.json
refreshToken=$(jq -r .cognitoRefreshToken infra-config.json)
clientId=$(jq -r .cognitoClientId infra-config.json)
apiGatewayUrl=$(jq -r .onboardingApiEndpoint infra-config.json)
tokenEnpoint=$(jq -r .tokenEnpoint infra-config.json)
TEST_DEVICE=DEV_rasp_00000001

echo "2. Testing create and retreive for environment '$env' on api Gateway enpoint:$apiGatewayUrl "
newman run --env-var deviceName=$TEST_DEVICE  --env-var tokenEnpoint=$tokenEnpoint --env-var baseUrl=$apiGatewayUrl --env-var clientId=$clientId --env-var refreshToken=$refreshToken iotOnboardingcreate.postman_collection.json

#openssl s_client -connect abv5y12g9aiau-ats.iot.eu-central-1.amazonaws.com:8443 -CAfile AmazonRootCA1.pem -cert cert.pem -key key.pk -debug
echo "3. Testing connectivity to IOT core"
rm tokens.json
rm device.json
echo "3.1 getting ID token form token enpoint: $tokenEnpoint?grant_type=refresh_token&client_id=$clientId&refresh_token=$refreshToken"
curl --location --request POST "$tokenEnpoint?grant_type=refresh_token&client_id=$clientId&refresh_token=$refreshToken" --header 'Content-Type: application/x-www-form-urlencoded' -o tokens.json
jq . tokens.json
echo ""
echo "3.2 Getting onboarded device data at "
token=$(jq -r .access_token tokens.json)
curl --location --request POST $apiGatewayUrl"api/onboard/$TEST_DEVICE" --header "Authorization: $token" -o device.json
jq . device.json
echo "3.3 Gettin Certificate"
jq -r .credential.certificatePem device.json>cert.pem
cat cert.pem
echo "3.4 Getting Private Key"
jq -r .credential.privateKey device.json>pk.pem
cat pk.pem
mqttEndpoint=$(jq -r .mqttEndpoint device.json)
echo "3.5 Starting Connectiviy test for device $TEST_DEVICE at endpoint $mqttEndpoint"
echo mosquitto_pub -h $mqttEndpoint\
              -p 8883\
              --cafile AmazonRootCA1.pem\
              --cert cert.pem\
              --key pk.pem\
              -t data/test\
              -d\
              -i $TEST_DEVICE\
              -m "{\"message\": \"hello IOT Onboarding Quickstart from device: $TEST_DEVICE\"}"

# echo ""
# echo "4. Testing delete for '$env' on api Gateway enpoint:$apiGatewayUrl "
# newman run --env-var deviceName=$TEST_DEVICE  --env-var tokenEnpoint=$tokenEnpoint --env-var baseUrl=$apiGatewayUrl --env-var clientId=$clientId --env-var refreshToken=$refreshToken iotOnboardingdelete.postman_collection.json

fi

mosquitto_pub -h armrdwyonijql-ats.iot.us-east-1.amazonaws.com -p 8883 --cafile AmazonRootCA1.pem --cert cert.pem --key pk.pem -t data/test -d -i DEV_RPI_0000002 -m "{\"message\": \"hello IOT Onboarding Quickstart from device: DEV_RPI_0000002, this is bhaq reporting for duty\"}"   
