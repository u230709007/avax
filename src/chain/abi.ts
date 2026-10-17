// docs: docs/avalanche.md
import { parseAbi } from "viem";

export const POLICY_REGISTRY_ABI = parseAbi([
  "function state() view returns (bytes32, uint64, bool)",
  "function owner() view returns (address)",
  "function setPolicyHash(bytes32 newHash)",
  "function pause()",
  "function unpause()",
  "event PolicyHashSet(bytes32 indexed policyHash, uint64 version, address indexed by)",
  "event Paused(address indexed by)",
  "event Unpaused(address indexed by)",
]);

export const AUDIT_ANCHOR_ABI = parseAbi([
  "function anchor(bytes32 root, uint64 fromSeq, uint64 toSeq) returns (uint256)",
  "function nextSeq() view returns (uint64)",
  "function count() view returns (uint256)",
  "function get(uint256 index) view returns ((bytes32 root, uint64 fromSeq, uint64 toSeq, uint64 timestamp))",
  "event Anchored(uint256 indexed index, bytes32 indexed root, uint64 fromSeq, uint64 toSeq)",
]);
