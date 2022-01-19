#!/bin/bash
echo -e "Deploying L2 Token"
npx hardhat deploy --tags L2_LPT --network arbitrumRinkeby

echo -e "Deploying L1 Escrow"
npx hardhat deploy --tags L1_ESCROW --network rinkeby

echo -e "\n Deploying L2 Data Cache"
npx hardhat deploy --tags L2_DATA_CACHE --network arbitrumRinkeby

echo -e "\n Deploying L1 Data Cache"
npx hardhat deploy --tags L1_DATA_CACHE --network rinkeby

echo -e "\n Configuring L2 Data Cache"
npx hardhat deploy --tags L2_DATA_CACHE_CONFIG --network arbitrumRinkeby

echo -e "\n Deploying L2 Gateway"
npx hardhat deploy --tags L2_GATEWAY --network arbitrumRinkeby

echo -e "\n Deploying L1 Gateway"
npx hardhat deploy --tags L1_GATEWAY --network rinkeby

echo -e "\n Initialize L1 Bridge"
npx hardhat deploy --tags L1_GATEWAY_INIT --network rinkeby

echo -e "\n Initialize L2 Bridge"
npx hardhat deploy --tags L2_GATEWAY_INIT --network arbitrumRinkeby

echo -e "\n Deploying Delegator Pool"
npx hardhat deploy --tags L2_DELEGATOR_POOL --network arbitrumRinkeby

echo -e "\n Deploying L2 Migrator"
npx hardhat deploy --tags L2_MIGRATOR --network arbitrumRinkeby

echo -e "\n Deploying L1 Migrator"
npx hardhat deploy --tags L1_MIGRATOR --network rinkeby

echo -e "\n Initialize L2 Migrator"
npx hardhat deploy --tags L2_MIGRATOR_CONFIG --network arbitrumRinkeby

echo -e "\n Unpause L1 Migrator"
npx hardhat deploy --tags L1_MIGRATOR_UNPAUSE --network rinkeby
