/**
 * deploy.js
 *
 * Deploys ApertureRegistry.sol to Polygon.
 *
 * Compilation strategy (in priority order):
 *   1. Auto-compile using `solc` npm package (if installed)
 *   2. Load pre-compiled JSON from ApertureRegistry.compiled.json (if exists)
 *   3. Fall back to embedded ABI + manual bytecode paste instructions
 *
 * To install solc for auto-compilation:
 *   pnpm add -D solc
 *
 * Run from dataIngestion/ directory:
 *   node blockchain/deploy.js
 */

"use strict";

const path       = require("path");
const fs         = require("fs");
const { ethers } = require("ethers");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// =============================================================================
// COMPILATION
// =============================================================================

const CONTRACT_SOURCE_PATH = path.resolve(__dirname, "ApertureRegistry.sol");
const COMPILED_OUTPUT_PATH = path.resolve(__dirname, "ApertureRegistry.compiled.json");

let ABI      = null;
let BYTECODE = null;

/**
 * Attempt 1: Compile the Solidity source using the solc npm package.
 */
function tryCompileWithSolc() {
  let solc;
  try {
    solc = require("solc");
  } catch {
    return false;
  }

  console.log("[Deploy] Compiling with solc...");

  const source = fs.readFileSync(CONTRACT_SOURCE_PATH, "utf8");

  const input = JSON.stringify({
    language: "Solidity",
    sources: {
      "ApertureRegistry.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
    },
  });

  const output = JSON.parse(solc.compile(input));

  // Check for compilation errors
  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length > 0) {
      console.error("[Deploy] Compilation errors:");
      for (const err of errors) {
        console.error(`  ${err.formattedMessage}`);
      }
      return false;
    }
  }

  const contract =
    output.contracts?.["ApertureRegistry.sol"]?.["ApertureRegistry"];

  if (!contract) {
    console.error("[Deploy] Contract not found in compilation output.");
    return false;
  }

  ABI      = contract.abi;
  BYTECODE = "0x" + contract.evm.bytecode.object;

  // Save compiled output for future use (avoids needing solc on next deploy)
  fs.writeFileSync(
    COMPILED_OUTPUT_PATH,
    JSON.stringify({ abi: ABI, bytecode: BYTECODE }, null, 2),
  );
  console.log("[Deploy] Compiled output saved → ApertureRegistry.compiled.json");

  return true;
}

/**
 * Attempt 2: Load pre-compiled JSON (from a previous solc run or Remix export).
 */
function tryLoadPreCompiled() {
  try {
    if (!fs.existsSync(COMPILED_OUTPUT_PATH)) return false;

    const data = JSON.parse(fs.readFileSync(COMPILED_OUTPUT_PATH, "utf8"));

    if (data.abi && data.bytecode) {
      ABI      = data.abi;
      BYTECODE = data.bytecode;
      console.log("[Deploy] Loaded pre-compiled ABI + bytecode.");
      return true;
    }
  } catch {
    // Fall through
  }
  return false;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("\n=== Aperture Registry — Deployment ===\n");

  // ── Try to get compiled output ──────────────────────────────────────────
  if (!tryCompileWithSolc() && !tryLoadPreCompiled()) {
    console.log("=".repeat(60));
    console.log("COMPILED OUTPUT REQUIRED");
    console.log("=".repeat(60));
    console.log("\nOption A — Install solc and retry (recommended):");
    console.log("  pnpm add -D solc");
    console.log("  node blockchain/deploy.js\n");
    console.log("Option B — Compile via Remix IDE:");
    console.log("  1. Go to https://remix.ethereum.org");
    console.log("  2. Create: ApertureRegistry.sol");
    console.log("  3. Paste contents of: dataIngestion/blockchain/ApertureRegistry.sol");
    console.log("  4. Compile with: Solidity 0.8.20 + Optimizer ON (200 runs)");
    console.log("  5. Click Compilation Details");
    console.log("  6. Copy the ABI and bytecode");
    console.log("  7. Save as blockchain/ApertureRegistry.compiled.json:");
    console.log('     { "abi": [...], "bytecode": "0x..." }');
    console.log("  8. Run: node blockchain/deploy.js\n");
    process.exit(0);
  }

  // ── Validate env ─────────────────────────────────────────────────────────
  const rpcUrl     = process.env.POLYGON_RPC_URL;
  const privateKey = process.env.ANCHOR_WALLET_KEY;

  if (!rpcUrl) {
    console.error("ERROR: Set POLYGON_RPC_URL in dataIngestion/.env\n");
    process.exit(1);
  }

  if (!privateKey || privateKey === "your-wallet-private-key-here") {
    console.error("ERROR: Set ANCHOR_WALLET_KEY in dataIngestion/.env\n");
    console.error("Generate a fresh wallet:");
    console.error(
      '  node -e "const {ethers}=require(\'ethers\'); ' +
        "const w=ethers.Wallet.createRandom(); " +
        "console.log('Address:', w.address); " +
        'console.log(\'Key:\', w.privateKey)"',
    );
    console.error(
      "\nGet free testnet MATIC: https://faucet.polygon.technology\n",
    );
    process.exit(1);
  }

  // ── Connect ──────────────────────────────────────────────────────────────
  // Use the first RPC URL (comma-separated list support)
  const primaryRpc = rpcUrl.split(",")[0].trim();
  const provider   = new ethers.JsonRpcProvider(primaryRpc, undefined, {
    staticNetwork: ethers.Network.from(80002),
    batchMaxCount: 1,
  });
  const signer     = new ethers.Wallet(privateKey, provider);

  console.log(`Wallet  : ${signer.address}`);
  console.log(`RPC     : ${primaryRpc}`);

  const balance = await provider.getBalance(signer.address);
  console.log(`Balance : ${ethers.formatEther(balance)} MATIC`);

  if (balance === 0n) {
    console.error(
      "\nERROR: Wallet has no MATIC.\n" +
        "Get free testnet MATIC: https://faucet.polygon.technology\n" +
        "(Select 'Polygon Amoy', enter your wallet address)\n",
    );
    process.exit(1);
  }

  // ── Deploy ───────────────────────────────────────────────────────────────
  console.log("\nDeploying ApertureRegistry...\n");

  const factory  = new ethers.ContractFactory(ABI, BYTECODE, signer);
  const deployed = await factory.deploy({
    gasLimit: 1500000n,
    maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.parseUnits("35", "gwei"),
  });

  console.log(`Transaction: ${deployed.deploymentTransaction().hash}`);
  console.log("Waiting for confirmation...");

  await deployed.waitForDeployment();
  const address = await deployed.getAddress();

  console.log("\n" + "=".repeat(50));
  console.log("CONTRACT DEPLOYED SUCCESSFULLY");
  console.log("=".repeat(50));
  console.log(`Address  : ${address}`);
  console.log(`Deployer : ${signer.address}`);
  console.log("=".repeat(50) + "\n");

  // Automatically update .env if CONTRACT_ADDRESS is empty
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(/CONTRACT_ADDRESS=["'].*?["']/, `CONTRACT_ADDRESS="${address}"`);
    envContent = envContent.replace('BLOCKCHAIN_ENABLED="false"', 'BLOCKCHAIN_ENABLED="true"');
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("✓ Updated dataIngestion/.env with CONTRACT_ADDRESS and set BLOCKCHAIN_ENABLED=\"true\"\n");
  } else {
    console.log("Add this to dataIngestion/.env:");
    console.log(`CONTRACT_ADDRESS="${address}"\n`);
  }

  // ── Post-deploy verification ─────────────────────────────────────────────
  const registry = new ethers.Contract(address, ABI, signer);
  console.log(
    `Verification: owner()            → ${await registry.owner()} ✓`,
  );
  console.log(
    `Verification: configHistoryLength() → ${await registry.configHistoryLength()} ✓`,
  );
  console.log(
    `Verification: cibRegistrySize()     → ${await registry.cibRegistrySize()} ✓`,
  );
  console.log(
    `\nPolygonScan: https://amoy.polygonscan.com/address/${address}\n`,
  );

  // ── Save ABI for reference ───────────────────────────────────────────────
  const abiPath = path.resolve(__dirname, "ApertureRegistry.abi.json");
  fs.writeFileSync(abiPath, JSON.stringify(ABI, null, 2));
  console.log("ABI saved → blockchain/ApertureRegistry.abi.json");
}

main().catch((err) => {
  console.error("\nDeployment failed:", err.message);
  process.exitCode = 1;
});
