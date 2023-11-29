import "@matterlabs/hardhat-zksync-solc";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solpp";
// import "@nomiclabs/hardhat-waffle";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import '@typechain/hardhat'
import '@nomicfoundation/hardhat-chai-matchers'

import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import { task } from "hardhat/config";
import "solidity-coverage";
import { getNumberFromEnv } from "./scripts/utils";

// If no network is specified, use the default config
if (!process.env.CHAIN_ETH_NETWORK) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const systemParams = require("../SystemConfig.json");

const PRIORITY_TX_MAX_GAS_LIMIT = getNumberFromEnv("CONTRACTS_PRIORITY_TX_MAX_GAS_LIMIT");
const DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT = getNumberFromEnv("CONTRACTS_DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT");

const prodConfig = {
  UPGRADE_NOTICE_PERIOD: 0,
  // PRIORITY_EXPIRATION: 101,
  // NOTE: Should be greater than 0, otherwise zero approvals will be enough to make an instant upgrade!
  SECURITY_COUNCIL_APPROVALS_FOR_EMERGENCY_UPGRADE: 1,
  PRIORITY_TX_MAX_GAS_LIMIT,
  DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
  // DUMMY_VERIFIER: false,
  zksync: true,
};
const testnetConfig = {
  UPGRADE_NOTICE_PERIOD: 0,
  // PRIORITY_EXPIRATION: 101,
  // NOTE: Should be greater than 0, otherwise zero approvals will be enough to make an instant upgrade!
  SECURITY_COUNCIL_APPROVALS_FOR_EMERGENCY_UPGRADE: 1,
  PRIORITY_TX_MAX_GAS_LIMIT,
  DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
  // DUMMY_VERIFIER: true,
  zksync: true,
};
const testConfig = {
  UPGRADE_NOTICE_PERIOD: 0,
  PRIORITY_EXPIRATION: 101,
  SECURITY_COUNCIL_APPROVALS_FOR_EMERGENCY_UPGRADE: 2,
  PRIORITY_TX_MAX_GAS_LIMIT,
  DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
  // DUMMY_VERIFIER: true,
  zksync: true,
};
const localConfig = {
  ...prodConfig,
  // DUMMY_VERIFIER: true,
  zksync: true,
};

const contractDefs = {
  sepolia: testnetConfig,
  rinkeby: testnetConfig,
  ropsten: testnetConfig,
  goerli: testnetConfig,
  mainnet: prodConfig,
  test: testConfig,
  localhost: localConfig,
};

export default {
  zksolc: {
    version: "1.3.14",
    compilerSource: "binary",
    settings: {
      isSystem: true,
    },
  },
  solidity: {
    version: "0.8.20",
  },

  defaultNetwork: "localhost",
  // contractSizer: {
  //   runOnCompile: false,
  //   except: ["dev-contracts", "zksync/upgrade-initializers", "zksync/libraries", "common/libraries"],
  // },
  // paths: {
  //   sources: "./contracts",
  // },
  solpp: {
    defs: (() => {
      const defs = process.env.CONTRACT_TESTS ? contractDefs.test : contractDefs[process.env.CHAIN_ETH_NETWORK];

      return {
        ...systemParams,
        ...testConfig,
      };
    })(),
  },
  networks: {
    localhost: {
      // era-test-node default url
      url: "http://127.0.0.1:3050",
      ethNetwork: "https://testnet.era.zksync.dev",
      zksync: true,
    },
    zkSyncTestnet: {
      url: "https://zksync2-testnet.zksync.dev",
      ethNetwork: "goerli",
      zksync: true,
      // contract verification endpoint
      verifyURL: "https://zksync2-testnet-explorer.zksync.dev/contract_verification",
    },
    zksyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      zksync: true,
      // contract verification endpoint
      verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },
  },
  // etherscan: {
  //   apiKey: process.env.MISC_ETHERSCAN_API_KEY,
  // },
  // gasReporter: {
  //   enabled: true,
  // },
  typechain: {
    target: "ethers-v5",
  }
};

task("solpp", "Preprocess Solidity source files").setAction(async (_, hre) =>
  hre.run(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS)
);
