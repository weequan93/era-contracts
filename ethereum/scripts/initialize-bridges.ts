import { Command } from "commander";
import { ethers } from "ethers";
import { Deployer } from "../src.ts/deploy";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import {
  computeL2Create2Address,
  web3Provider,
  hashL2Bytecode,
  applyL1ToL2Alias,
  getNumberFromEnv,
  REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
} from "./utils";

import * as fs from "fs";
import * as path from "path";
import { Provider, Wallet } from "zksync-web3";
import * as hre from "hardhat";

// const provider = web3Provider();
const provider = new Provider((hre.network.config as any).ethNetwork);
const testConfigPath = path.join(process.env.ZKSYNC_HOME as string, "etc/test_config/constant");
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: "utf-8" }));

const contractArtifactsPath = path.join(process.env.ZKSYNC_HOME as string, "contracts/zksync/artifacts-zk/");

const l2BridgeArtifactsPath = path.join(contractArtifactsPath, "cache-zk/solpp-generated-contracts/bridge/");

const openzeppelinTransparentProxyArtifactsPath = path.join(
  contractArtifactsPath,
  "@openzeppelin/contracts/proxy/transparent/"
);
const openzeppelinBeaconProxyArtifactsPath = path.join(contractArtifactsPath, "@openzeppelin/contracts/proxy/beacon");

function readBytecode(path: string, fileName: string) {
  return JSON.parse(fs.readFileSync(`${path}/${fileName}.sol/${fileName}.json`, { encoding: "utf-8" })).bytecode;
}

function readInterface(path: string, fileName: string) {
  const abi = JSON.parse(fs.readFileSync(`${path}/${fileName}.sol/${fileName}.json`, { encoding: "utf-8" })).abi;
  return new ethers.utils.Interface(abi);
}

const L2_ERC20_BRIDGE_PROXY_BYTECODE = readBytecode(
  openzeppelinTransparentProxyArtifactsPath,
  "TransparentUpgradeableProxy"
);
const L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE = readBytecode(l2BridgeArtifactsPath, "L2ERC20Bridge");
const L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE = readBytecode(l2BridgeArtifactsPath, "L2StandardERC20");
const L2_STANDARD_ERC20_PROXY_BYTECODE = readBytecode(openzeppelinBeaconProxyArtifactsPath, "BeaconProxy");
const L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE = readBytecode(
  openzeppelinBeaconProxyArtifactsPath,
  "UpgradeableBeacon"
);
const L2_ERC20_BRIDGE_INTERFACE = readInterface(l2BridgeArtifactsPath, "L2ERC20Bridge");
const DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT = getNumberFromEnv("CONTRACTS_DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT");

async function main() {
  const program = new Command();

  program.version("0.1.0").name("initialize-bridges");

  program
    .option("--private-key <private-key>")
    .option("--gas-price <gas-price>")
    .option("--nonce <nonce>")
    .option("--erc20-bridge <erc20-bridge>")
    .action(async (cmd) => {
      const deployWallet = cmd.privateKey
        ? new Wallet(cmd.privateKey, provider)
        : Wallet.fromMnemonic(
            process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
            "m/44'/60'/0'/0/0"
          ).connect(provider);
      console.log(`Using deployer wallet: ${deployWallet.address}`);

      const gasPrice = cmd.gasPrice ? parseUnits(cmd.gasPrice, "gwei") : await provider.getGasPrice();
      console.log(`Using gas price: ${formatUnits(gasPrice, "gwei")} gwei`);

      const nonce = cmd.nonce ? parseInt(cmd.nonce) : await deployWallet.getTransactionCount();
      console.log(`Using nonce: ${nonce}`);

      const deployer = new Deployer({
        deployWallet,
        verbose: true,
      });
      console.error("P 1")

      const zkSync = deployer.zkSyncContract(deployWallet);
      const erc20Bridge = cmd.erc20Bridge
        ? deployer.defaultERC20Bridge(deployWallet).attach(cmd.erc20Bridge)
        : deployer.defaultERC20Bridge(deployWallet);
      console.error("P 2")
      const priorityTxMaxGasLimit = getNumberFromEnv("CONTRACTS_PRIORITY_TX_MAX_GAS_LIMIT");
      const l1GovernorAddress = await zkSync.getGovernor();
      console.error("P 3")
      // Check whether governor is a smart contract on L1 to apply alias if needed.
      const l1GovernorCodeSize = ethers.utils.hexDataLength(await deployWallet.provider.getCode(l1GovernorAddress));
      console.error("P 4")
      const l2GovernorAddress = l1GovernorCodeSize == 0 ? l1GovernorAddress : applyL1ToL2Alias(l1GovernorAddress);
      console.error("P 5")
      const abiCoder = new ethers.utils.AbiCoder();

      const l2ERC20BridgeImplAddr = computeL2Create2Address(
        applyL1ToL2Alias(erc20Bridge.address),
        L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE,
        "0x",
        ethers.constants.HashZero
      );
      console.error("P 6", l2ERC20BridgeImplAddr)
      const proxyInitializationParams = L2_ERC20_BRIDGE_INTERFACE.encodeFunctionData("initialize", [
        erc20Bridge.address,
        hashL2Bytecode(L2_STANDARD_ERC20_PROXY_BYTECODE),
        l2GovernorAddress,
      ]);
      console.error("P 7", proxyInitializationParams)
      const l2ERC20BridgeProxyAddr = computeL2Create2Address(
        applyL1ToL2Alias(erc20Bridge.address),
        L2_ERC20_BRIDGE_PROXY_BYTECODE,
        ethers.utils.arrayify(
          abiCoder.encode(
            ["address", "address", "bytes"],
            [l2ERC20BridgeImplAddr, l2GovernorAddress, proxyInitializationParams]
          )
        ),
        ethers.constants.HashZero
      );
      console.error("P 18", l2ERC20BridgeProxyAddr)
      const l2StandardToken = computeL2Create2Address(
        l2ERC20BridgeProxyAddr,
        L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE,
        "0x",
        ethers.constants.HashZero
      );
      console.error("P 9", l2StandardToken)
      const l2TokenFactoryAddr = computeL2Create2Address(
        l2ERC20BridgeProxyAddr,
        L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE,
        ethers.utils.arrayify(abiCoder.encode(["address"], [l2StandardToken])),
        ethers.constants.HashZero
      );
      console.error("P 10", l2TokenFactoryAddr)
      // There will be two deployments done during the initial initialization
      const requiredValueToInitializeBridge = await zkSync.l2TransactionBaseCost(
        gasPrice,
        DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
        REQUIRED_L2_GAS_PRICE_PER_PUBDATA
      );
      console.error("P 11", requiredValueToInitializeBridge)
      const requiredValueToPublishBytecodes = await zkSync.l2TransactionBaseCost(
        gasPrice,
        priorityTxMaxGasLimit,
        REQUIRED_L2_GAS_PRICE_PER_PUBDATA
      );
      console.error("P 12", requiredValueToPublishBytecodes)
      // const independentInitialization = [
     const tx1=  await  zkSync.requestL2Transaction(
          ethers.constants.AddressZero,
          0,
          "0x",
          priorityTxMaxGasLimit,
          REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
          [L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE, L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE],
          deployWallet.address,
          { gasPrice, nonce, value: requiredValueToPublishBytecodes }
        )
      console.log(`Transaction sent with hash ${tx1.hash} and nonce ${tx1.nonce}. Waiting for receipt...`);
    const tx2=  await  erc20Bridge.initialize(
          [L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE, L2_ERC20_BRIDGE_PROXY_BYTECODE, L2_STANDARD_ERC20_PROXY_BYTECODE],
          l2TokenFactoryAddr,
          l2GovernorAddress,
          requiredValueToInitializeBridge,
          requiredValueToInitializeBridge,
          {
            gasPrice,
            nonce: nonce + 1,
            value: requiredValueToInitializeBridge.mul(2),
          }
        )
      // ];
      console.error("P 13")
      // const txs = await Promise.all(independentInitialization);
    
      console.log(`Transaction sent with hash ${tx2.hash} and nonce ${tx2.nonce}. Waiting for receipt...`);
      console.error("P 14")


      console.log(`CONTRACTS_L2_ERC20_BRIDGE_ADDR=${await erc20Bridge.l2Bridge()}`);
    });

  await program.parseAsync(process.argv);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
