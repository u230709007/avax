// docs: docs/audit.md
import { concat, keccak256, type Hex } from "viem";

/** Sıralı Merkle ağacı: çift sayıda olmayan seviyede son yaprak kendisiyle eşlenir. */
function hashPair(a: Hex, b: Hex): Hex {
  return keccak256(concat([a, b]));
}

export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) throw new Error("Boş ağaç");
  let level = leaves;
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i]!, level[i + 1] ?? level[i]!));
    level = next;
  }
  return level[0]!;
}

export interface ProofStep {
  sibling: Hex;
  /** Kardeş sağda mı? */
  right: boolean;
}

export function merkleProof(leaves: Hex[], index: number): ProofStep[] {
  const proof: ProofStep[] = [];
  let level = leaves;
  let idx = index;
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    proof.push({ sibling: level[siblingIdx] ?? level[idx]!, right: !isRight });
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i]!, level[i + 1] ?? level[i]!));
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: ProofStep[], root: Hex): boolean {
  let h = leaf;
  for (const step of proof) h = step.right ? hashPair(h, step.sibling) : hashPair(step.sibling, h);
  return h.toLowerCase() === root.toLowerCase();
}
