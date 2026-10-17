// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {IntentGate} from "../src/IntentGate.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

/// forge-std olmadan minimal test: başarısız assert revert eder.
contract IntentGateTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ATTACKER = address(0xBAD);
    bytes32 constant POLICY = keccak256("policy-v2");

    PolicyRegistry reg;
    IntentGate gate;

    function setUp() public {
        reg = new PolicyRegistry(POLICY);
        gate = new IntentGate(address(reg), address(this));
    }

    function test_commitRecordsIntent() public {
        uint256 i = gate.commit(keccak256("order-1"), POLICY);
        require(i == 0 && gate.count() == 1, "index");
        require(gate.committedAt(keccak256("order-1")) != 0, "timestamp");
    }

    function test_killSwitchBlocksCommitInSameBlock() public {
        reg.pause();
        vm.expectRevert(IntentGate.PausedOnchain.selector);
        gate.commit(keccak256("order-2"), POLICY);
    }

    function test_policyMismatchRejected() public {
        vm.expectRevert(abi.encodeWithSelector(IntentGate.PolicyMismatch.selector, POLICY, keccak256("stale")));
        gate.commit(keccak256("order-3"), keccak256("stale"));
    }

    function test_onlyCommitter() public {
        vm.prank(ATTACKER);
        vm.expectRevert(IntentGate.NotCommitter.selector);
        gate.commit(keccak256("order-4"), POLICY);
    }

    function test_noReplay() public {
        gate.commit(keccak256("order-5"), POLICY);
        vm.expectRevert(IntentGate.AlreadyCommitted.selector);
        gate.commit(keccak256("order-5"), POLICY);
    }
}
