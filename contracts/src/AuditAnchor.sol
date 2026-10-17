// SPDX-License-Identifier: MIT
// docs: docs/avalanche.md
pragma solidity ^0.8.24;

/// @title AuditAnchor
/// @notice Guardian audit log'unun Merkle köklerini sıralı ve boşluksuz biçimde sabitler.
/// Aralıklar ardışık olmak zorundadır (fromSeq == nextSeq); geçmiş yeniden yazılamaz.
contract AuditAnchor {
    struct Anchor {
        bytes32 root;
        uint64 fromSeq;
        uint64 toSeq;
        uint64 timestamp;
    }

    address public immutable anchorer;
    uint64 public nextSeq = 1;
    Anchor[] private anchors;

    event Anchored(uint256 indexed index, bytes32 indexed root, uint64 fromSeq, uint64 toSeq);

    error NotAnchorer();
    error NonContiguous(uint64 expectedFrom, uint64 gotFrom);
    error BadRange();

    constructor(address anchorer_) {
        anchorer = anchorer_;
    }

    function anchor(bytes32 root, uint64 fromSeq, uint64 toSeq) external returns (uint256 index) {
        if (msg.sender != anchorer) revert NotAnchorer();
        if (fromSeq != nextSeq) revert NonContiguous(nextSeq, fromSeq);
        if (toSeq < fromSeq || root == bytes32(0)) revert BadRange();
        anchors.push(Anchor(root, fromSeq, toSeq, uint64(block.timestamp)));
        nextSeq = toSeq + 1;
        index = anchors.length - 1;
        emit Anchored(index, root, fromSeq, toSeq);
    }

    function count() external view returns (uint256) {
        return anchors.length;
    }

    function get(uint256 index) external view returns (Anchor memory) {
        return anchors[index];
    }
}
