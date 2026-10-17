// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {AuditAnchor} from "../src/AuditAnchor.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
}

/// forge-std olmadan minimal test: başarısız assert revert eder.
contract RegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ATTACKER = address(0xBAD);

    PolicyRegistry reg;
    AuditAnchor anc;

    function setUp() public {
        reg = new PolicyRegistry(keccak256("policy-v1"));
        anc = new AuditAnchor(address(this));
    }

    function test_initialState() public view {
        (bytes32 h, uint64 v, bool p) = reg.state();
        require(h == keccak256("policy-v1") && v == 1 && !p, "initial");
    }

    function test_ownerCanRotateHashAndPause() public {
        reg.setPolicyHash(keccak256("policy-v2"));
        reg.pause();
        (bytes32 h, uint64 v, bool p) = reg.state();
        require(h == keccak256("policy-v2") && v == 2 && p, "rotated+paused");
        reg.unpause();
        require(!reg.paused(), "unpaused");
    }

    function test_attackerCannotChangePolicy() public {
        vm.prank(ATTACKER);
        vm.expectRevert(PolicyRegistry.NotOwner.selector);
        reg.setPolicyHash(keccak256("evil"));
    }

    function test_attackerCannotUnpause() public {
        reg.pause();
        vm.prank(ATTACKER);
        vm.expectRevert(PolicyRegistry.NotOwner.selector);
        reg.unpause();
    }

    function test_zeroHashRejected() public {
        vm.expectRevert(PolicyRegistry.ZeroHash.selector);
        reg.setPolicyHash(bytes32(0));
    }

    function test_anchorsAreContiguous() public {
        anc.anchor(keccak256("r1"), 1, 20);
        anc.anchor(keccak256("r2"), 21, 25);
        require(anc.count() == 2 && anc.nextSeq() == 26, "contiguous");
        AuditAnchor.Anchor memory a = anc.get(1);
        require(a.root == keccak256("r2") && a.fromSeq == 21 && a.toSeq == 25, "stored");
    }

    function test_gapOrRewriteRejected() public {
        anc.anchor(keccak256("r1"), 1, 20);
        vm.expectRevert(abi.encodeWithSelector(AuditAnchor.NonContiguous.selector, uint64(21), uint64(1)));
        anc.anchor(keccak256("rewrite"), 1, 20);
    }

    function test_onlyAnchorer() public {
        vm.prank(ATTACKER);
        vm.expectRevert(AuditAnchor.NotAnchorer.selector);
        anc.anchor(keccak256("x"), 1, 1);
    }
}
