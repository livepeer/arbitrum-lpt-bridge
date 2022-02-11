#!/bin/bash
set -eux

if [ -z ${L1_NETWORK+x} ];
then
    echo "L1_NETWORK is not set"
    exit 1
fi

if [ -z ${L2_NETWORK+x} ];
then
    echo "L2_NETWORK is not set"
    exit 1
fi

echo -e "Deploying L1 Escrow"
npx hardhat deploy --tags L1_ESCROW --network $L1_NETWORK

echo -e "\n Deploying L2 Data Cache"
npx hardhat deploy --tags L2_DATA_CACHE --network $L2_NETWORK

echo -e "\n Deploying L1 Data Cache"
npx hardhat deploy --tags L1_DATA_CACHE --network $L1_NETWORK

echo -e "\n Deploying L2 Gateway"
npx hardhat deploy --tags L2_GATEWAY --network $L2_NETWORK

echo -e "\n Deploying L1 Gateway"
npx hardhat deploy --tags L1_GATEWAY --network $L1_NETWORK

echo -e "\n Deploying Delegator Pool"
npx hardhat deploy --tags L2_DELEGATOR_POOL --network $L2_NETWORK

echo -e "\n Deploying L2 Migrator"
npx hardhat deploy --tags L2_MIGRATOR --network $L2_NETWORK

echo -e "\n Deploying L1 Migrator"
npx hardhat deploy --tags L1_MIGRATOR --network $L1_NETWORK

echo -e "\n Configuring L2 Data Cache"
npx hardhat deploy --tags L2_DATA_CACHE_CONFIG --network $L2_NETWORK

echo -e "\n Initialize L1 Bridge"
npx hardhat deploy --tags L1_GATEWAY_INIT --network $L1_NETWORK

echo -e "\n Initialize L2 Bridge"
npx hardhat deploy --tags L2_GATEWAY_INIT --network $L2_NETWORK

echo -e "\n Initialize L2 Migrator"
npx hardhat deploy --tags L2_MIGRATOR_CONFIG --network $L2_NETWORK
