// SPDX-License-Identifier: MIT
// docs: docs/avalanche.md
pragma solidity ^0.8.24;

/// @title PolicyRegistry
/// @notice Guardian'ın çalıştırdığı policy.json'ın keccak256 hash'ini ve zincir üstü kill-switch'i tutar.
/// Guardian yerel hash bu değerle eşleşmezse veya `paused` true ise işlem açmaz.
contract PolicyRegistry {
    address public owner;
    bytes32 public policyHash;
    uint64 public policyVersion;
    bool public paused;

    event PolicyHashSet(bytes32 indexed policyHash, uint64 version, address indexed by);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error ZeroHash();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(bytes32 initialHash) {
        if (initialHash == bytes32(0)) revert ZeroHash();
        owner = msg.sender;
        policyHash = initialHash;
        policyVersion = 1;
        emit OwnershipTransferred(address(0), msg.sender);
        emit PolicyHashSet(initialHash, 1, msg.sender);
    }

    function setPolicyHash(bytes32 newHash) external onlyOwner {
        if (newHash == bytes32(0)) revert ZeroHash();
        policyHash = newHash;
        policyVersion += 1;
        emit PolicyHashSet(newHash, policyVersion, msg.sender);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address to) external onlyOwner {
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    /// @notice Guardian'ın tek çağrıda okuduğu durum.
    function state() external view returns (bytes32, uint64, bool) {
        return (policyHash, policyVersion, paused);
    }
}
