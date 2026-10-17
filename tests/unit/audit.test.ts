import { describe, expect, it } from "vitest";
import { Store } from "../../src/store/db.js";
import { AuditLog } from "../../src/audit/log.js";
import { merkleProof, merkleRoot, verifyProof } from "../../src/audit/merkle.js";
import { keccak256, toBytes } from "viem";

describe("Audit log", () => {
  it("hash zinciri doğrulanır ve değişiklik yakalanır", () => {
    const store = new Store(":memory:");
    const log = new AuditLog(store);
    for (let i = 0; i < 5; i++) log.append({ source: "llm", tool: "t", input: { i }, outcome: "OK" });
    expect(log.verifyChain()).toEqual({ ok: true });
    store.db.prepare("UPDATE audit SET outcome = 'ALLOWED' WHERE seq = 3").run();
    expect(log.verifyChain()).toEqual({ ok: false, seq: 3 });
  });

  it("Merkle kanıtı her yaprak için doğrulanır (tek sayılı ağaç dahil)", () => {
    for (const n of [1, 2, 5, 20]) {
      const leaves = Array.from({ length: n }, (_, i) => keccak256(toBytes(`leaf-${i}`)));
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) expect(verifyProof(leaves[i]!, merkleProof(leaves, i), root)).toBe(true);
      expect(verifyProof(keccak256(toBytes("fake")), merkleProof(leaves, 0), root)).toBe(n === 0);
    }
  });

  it("aralık kanıtı log üzerinden üretilir", () => {
    const log = new AuditLog(new Store(":memory:"));
    for (let i = 0; i < 7; i++) log.append({ source: "system", tool: "t", input: { i }, outcome: "OK" });
    const { leaf, proof, root } = log.proofFor(4, 2, 7);
    expect(AuditLog.verify(leaf, proof, root)).toBe(true);
    expect(root).toBe(log.rootFor(2, 7));
  });
});
