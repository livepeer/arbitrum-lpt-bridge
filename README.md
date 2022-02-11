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

## Tasks

Migrating a broadcaster (i.e. its funds locked as a sender in the L1 TicketBroker):

```
npx hardhat migrate-sender --network mainnet --l1addr <L1_ADDRESS> --l2addr <L2_ADDRESS> --sig <SIGNATURE>
``` 

- `--l1addr` is the broadcaster's L1 address.
- `--l2addr` is the L2 address to use for the broadcaster. You can specify the current L1 address as long as it is not a contract.
- `--sig` is a signature authorizing migration. See below.

Creating a signature to authorize migration of a broadcaster:

```
npx hardhat migrate-sender-typed-data --network mainnet --l1addr <L1_ADDRESS> --l2addr <L2_ADDRESS>
```

The output of this command will be a typed data payload that can be signed using the "Sign Typed Data" option in `livepeer_cli`.

Migrating unbonding locks in the L1 BondingManager:

```
npx hardhat migrate-unbonding-locks --network mainnet --l1addr <L1_ADDRESS> --l2addr <L2_ADDRESS> --sig <SIGNATURE>
```

- `--l1addr` is the L1 address with unbonding locks.
- `--l2addr` is the L2 address to stake the tokens from the unbonding locks for. You can specify the current L1 address as long as it is not a contract.
- `--sig` is a signature authorizing migration. See below.

Creating a signature to authorize migration of unbonding locks:

```
npx hardhat migrate-unbonding-locks-typed-data --network mainnet --l1addr <L1_ADDRESS> --l2addr <L2_ADDRESS>
```

The output of this command will be a typed data payload that can be signed using the "Sign Typed Data" option in `livepeer_cli`.