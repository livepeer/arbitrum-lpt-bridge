# arbitrum-lpt-bridge

A bridge to move LPT between Ethereum and Arbitrum

## Install

```
git clone https://github.com/livepeer/arbitrum-lpt-bridge.git
cd arbitrum-lpt-bridge
yarn
```

## Run Tests

```
yarn test
```

## Deploy LPT

```
yarn deploy:token --network arbitrumRinkeby
```

## Deploy Bridge Contracts

```
export L1_NETWORK=rinkeby
export L2_NETWORK=arbitrumRinkeby
export L1_PROTOCOL_DEPLOYMENT_EXPORT_PATH=~/Development/l1_contracts.json
export L2_PROTOCOL_DEPLOYMENT_EXPORT_PATH=~/Development/l2_contracts.json
yarn deploy
```
