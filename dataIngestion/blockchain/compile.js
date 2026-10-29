const fs = require('fs');
const path = require('path');
const solc = require('solc');

const sourcePath = path.resolve(__dirname, 'ApertureRegistry.sol');
const compiledPath = path.resolve(__dirname, 'ApertureRegistry.compiled.json');
const abiPath = path.resolve(__dirname, 'ApertureRegistry.abi.json');

console.log('[Compile] Compiling ApertureRegistry.sol with solc...');
const src = fs.readFileSync(sourcePath, 'utf8');

const input = JSON.stringify({
  language: 'Solidity',
  sources: { 'ApertureRegistry.sol': { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
});

const output = JSON.parse(solc.compile(input));
if (output.errors) {
  const errs = output.errors.filter((e) => e.severity === 'error');
  if (errs.length > 0) {
    console.error('[Compile] Compilation errors:');
    for (const err of errs) {
      console.error(err.formattedMessage);
    }
    process.exit(1);
  }
}

const contract = output.contracts['ApertureRegistry.sol']['ApertureRegistry'];
if (!contract) {
  console.error('[Compile] Contract ApertureRegistry not found.');
  process.exit(1);
}

fs.writeFileSync(
  compiledPath,
  JSON.stringify({ abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object }, null, 2)
);

fs.writeFileSync(
  abiPath,
  JSON.stringify(contract.abi, null, 2)
);

console.log('[Compile] Success! Saved to ApertureRegistry.compiled.json and ApertureRegistry.abi.json');
