// docs: docs/avalanche.md
/** Kontratları solc (npm) ile derler → contracts/artifacts/<Name>.json { abi, bytecode }. Foundry gerekmez. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import solc from "solc";

const SRC = "contracts/src";
const OUT = "contracts/artifacts";

const sources: Record<string, { content: string }> = {};
for (const f of readdirSync(SRC).filter((f) => f.endsWith(".sol"))) sources[f] = { content: readFileSync(join(SRC, f), "utf8") };

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts as Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string } } }>>)) {
  for (const [name, c] of Object.entries(contracts)) {
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ abi: c.abi, bytecode: `0x${c.evm.bytecode.object}`, source: file }, null, 2));
    console.log(`derlendi: ${name}`);
  }
}
