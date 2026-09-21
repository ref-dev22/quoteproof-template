// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockQuoteProofAggregator {
    uint8 private _decimals;
    string private _description;
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;
    bool private _revertLatest;

    constructor(uint8 decimals_, string memory description_) {
        _decimals = decimals_;
        _description = description_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        require(!_revertLatest, "oracle read failed");
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function setRoundData(uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_) external {
        _roundId = roundId_;
        _answer = answer_;
        _startedAt = startedAt_;
        _updatedAt = updatedAt_;
        _answeredInRound = roundId_;
    }

    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
    }

    function setRevertLatest(bool value) external {
        _revertLatest = value;
    }
}
