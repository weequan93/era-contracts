

import { Command } from "commander";
import * as hre from "hardhat";
import { ethers } from "ethers";
import { web3Provider } from "./utils";
import * as fs from "fs";
import * as path from "path";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { TestnetERC20Token__factory } from "../typechain-types/factories/cache-zk/solpp-generated-contracts/dev-contracts/TestnetERC20Token__factory"
import { Provider, Wallet } from "zksync-web3";
import { formatUnits, parseEther, parseUnits } from "ethers/lib/utils";
import { BigNumber } from "ethers";

const DEFAULT_ERC20 = "TestnetERC20Token";

const testConfigPath = path.join(process.env.ZKSYNC_HOME as string, "etc/test_config/constant");
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: "utf-8" }));

// const provider = web3Provider();

type Token = {
  address: string | null;
  name: string;
  symbol: string;
  decimals: number;
};

type TokenDescription = Token & {
  implementation?: string;
};

export function l1RpcUrl() {
  return process.env.ETH_CLIENT_WEB3_URL as string;
}

export function l2RpcUrl() {
  return process.env.API_WEB3_JSON_RPC_HTTP_URL as string;
}


async function deployToken(token: TokenDescription, wallet: Wallet): Promise<Token> {

  token.implementation = token.implementation || DEFAULT_ERC20;

  // @ts-ignore
  const deployer = new Deployer(hre, wallet);
  const artifact = token.implementation ? await deployer.loadArtifact(token.implementation) : await deployer.loadArtifact("TestnetERC20Token")

  let params: any = [token.name, token.symbol, BigNumber.from(token.decimals)]
  if (token.name == "Wrapped Ether") {
    params = []
  }

  const deploymentFee = await deployer.estimateDeployFee(artifact, params);

  const parsedFee = ethers.utils.formatEther(deploymentFee.toString());
  console.error(`The deployment is estimated to cost ${parsedFee} ETH`);
 
  const t = await deployer.deploy(artifact, params);
  console.error("t", token.name,[params], t.address)
  console.error(`${token.name} ${artifact.contractName} was deployed to ${t.address}`);

  if (token.implementation !== "WETH9") {
    await t.mint(wallet.address, parseEther("3000000000"));
  }

  token.address = t.address;

  // Remove the unneeded field
  if (token.implementation) {
    delete token.implementation;
  }

  return token;
}

async function main() {
  const program = new Command();

  program.version("0.1.0").name("deploy-erc20").description("deploy testnet erc20 token");

  program
    .command("add")
    .option("-n, --token-name <tokenName>")
    .option("-s, --symbol <symbol>")
    .option("-d, --decimals <decimals>")
    .option("-i --implementation <implementation>")
    .description("Adds a new token with a given fields")
    .action(async (cmd) => {
      const token: TokenDescription = {
        address: null,
        name: cmd.tokenName,
        symbol: cmd.symbol,
        decimals: cmd.decimals,
        implementation: cmd.implementation,
      };

      const provider = new Provider((hre.network.config as any).ethNetwork);
      const wallet = cmd.privateKey
        ? new Wallet(cmd.privateKey, provider)
        : Wallet.fromMnemonic(ethTestConfig.mnemonic, "m/44'/60'/0'/0/1").connect(provider);

      console.log(JSON.stringify(await deployToken(token, wallet), null, 2));
    });

  program
    .command("add-multi <tokens_json>")
    .option("--private-key <private-key>")
    .description("Adds a multiple tokens given in JSON format")
    .action(async (tokens_json: string, cmd) => {
      const tokens: Array<TokenDescription> = JSON.parse(tokens_json);
      const result = [];

      const provider = new Provider((hre.network.config as any).ethNetwork);

      const wallet = cmd.privateKey
        ? new Wallet(cmd.privateKey, provider)
        : Wallet.fromMnemonic(ethTestConfig.mnemonic, "m/44'/60'/0'/0/1").connect(provider);

      for (const token of tokens) {
        result.push(await deployToken(token, wallet));
      }

      console.log(JSON.stringify(result, null, 2));
    });

  await program.parseAsync(process.argv);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
  });
