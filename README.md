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

## Run Slither

Follow the [Slither installation guide](https://github.com/crytic/slither#how-to-install).

```
slither .
```

Note: As of Slither 0.8.2, `--triage-mode` does not properly save triage results to `slither.db.json` so there is not a `slither.db.json` file checked in right now. As a result, `slither` will currently always report findings that have already been triaged as non-issues. Once `--triage-mode` is fixed, a `slither.db.json` with triage results should be checked in so filter out already triaged findings.

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
