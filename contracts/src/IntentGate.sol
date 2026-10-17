// SPDX-License-Identifier: MIT
// docs: docs/avalanche.md
pragma solidity ^0.8.24;

interface IPolicyRegistry {
    function state() external view returns (bytes32, uint64, bool);
}

/// @title IntentGate
/// @notice Guardian her emirden ÖNCE emrin hash'ini buraya yazar; emir ancak bu işlem kesinleşince OKX'e gider.
/// Kill-switch ve policy hash'i aynı işlemde zincirde kontrol edilir: önbellek yok, durdurma bir sonraki blokta etkili.
contract IntentGate {
    IPolicyRegistry public immutable registry;
    address public immutable committer;
    uint256 public count;
    mapping(bytes32 => uint64) public committedAt;

    event IntentCommitted(uint256 indexed index, bytes32 indexed intentHash, bytes32 policyHash, uint64 timestamp);

    error NotCommitter();
    error ZeroHash();
    error AlreadyCommitted();
    error PausedOnchain();
    error PolicyMismatch(bytes32 onchain, bytes32 given);

    constructor(address registry_, address committer_) {
        registry = IPolicyRegistry(registry_);
        committer = committer_;
    }

    function commit(bytes32 intentHash, bytes32 policyHash) external returns (uint256 index) {
        if (msg.sender != committer) revert NotCommitter();
        if (intentHash == bytes32(0)) revert ZeroHash();
        if (committedAt[intentHash] != 0) revert AlreadyCommitted();
        (bytes32 onchain,, bool paused) = registry.state();
        if (paused) revert PausedOnchain();
        if (onchain != policyHash) revert PolicyMismatch(onchain, policyHash);
        committedAt[intentHash] = uint64(block.timestamp);
        index = count++;
        emit IntentCommitted(index, intentHash, policyHash, uint64(block.timestamp));
    }
}
