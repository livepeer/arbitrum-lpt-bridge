#!/bin/bash
echo -e "Deploying L1 Token and Bridge"
npx hardhat deploy --tags L1_GATEWAY --network rinkeby

echo -e "\n Deploying L2 Token and Bridge"
npx hardhat deploy --tags L2_GATEWAY --network arbitrumRinkeby

echo -e "\n Initialize L1 Bridge"
npx hardhat deploy --tags L1_GATEWAY_INIT --network rinkeby

echo -e "\n Initialize L2 Bridge"
npx hardhat deploy --tags L2_GATEWAY_INIT --network arbitrumRinkeby
