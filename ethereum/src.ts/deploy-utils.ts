import * as hardhat from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "ethers";
import { SingletonFactoryFactory } from "../typechain";
import { Deployer as _Deployer } from "@matterlabs/hardhat-zksync-deploy";

export async function deployViaCreate2(
  deployed: _Deployer,
  contractName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[],
  create2Salt: string,
  ethTxOptions: ethers.providers.TransactionRequest,
  create2FactoryAddress: string,
  verbose: boolean = true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  libraries?: any
): Promise<[string, string]> {
  // [address, txHash]

  const log = (msg: string) => {
    if (verbose) {
      console.log(msg);
    }
  };
  log(`Deploying ${contractName}`);

  const artifact = await deployed.loadArtifact(contractName)
  const contract = await deployed.deploy(artifact, args);

  log(`Deployed ${contractName} ${contract.address}`);

  return [contract.address, contract.hash];
}
