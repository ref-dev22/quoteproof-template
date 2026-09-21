// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IQuoteProofAggregator {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Records bounded reference quotes from the fixed Chainlink HBAR/USD feed.
/// @dev This contract records evidence; it never transfers the quoted tinybars.
contract QuoteProofRegistry {
    uint256 public constant SCHEMA_VERSION = 1;
    uint256 public constant MAX_CENTS = 100_000_000;
    uint256 public constant MIN_CENTS = 1;
    uint256 public constant MAX_ORACLE_DECIMALS = 18;
    bytes32 public constant FEED_ID = keccak256("HBAR/USD");
    bytes32 private constant EXPECTED_DESCRIPTION_HASH = keccak256("HBAR / USD");

    error InvalidCents();
    error InvalidMaxAge();
    error InvalidOracle();
    error InvalidFeedDescription();
    error UnexpectedDecimals(uint8 actual, uint8 expected);
    error OracleReadFailed();
    error InvalidRound();
    error InvalidAnswer();
    error InvalidObservationTime();
    error FutureObservation();
    error StaleObservation(uint256 age, uint256 maxAge);
    error PreviewRoundChanged(uint80 expected, uint80 actual);
    error PreviewNonceChanged(uint256 expected, uint256 actual);

    address public immutable oracle;
    uint8 public immutable expectedDecimals;
    uint64 public immutable maxAge;

    mapping(address issuer => uint256 nonce) public nonces;
    mapping(address issuer => mapping(uint256 nonce => bytes32 commitment)) private commitments;

    struct QuoteData {
        uint256 schemaVersion;
        uint256 chainId;
        address registry;
        address issuer;
        uint256 nonce;
        uint256 cents;
        address oracle;
        bytes32 feedId;
        uint80 roundId;
        uint256 price;
        uint8 decimals;
        uint256 observedAt;
        uint256 recordedAt;
        uint256 maximumAge;
        uint256 tinybars;
    }

    event QuoteRecorded(bytes32 indexed commitment, QuoteData quote);

    constructor(address oracle_, uint8 expectedDecimals_, uint64 maxAge_) {
        if (oracle_ == address(0) || oracle_.code.length == 0 || expectedDecimals_ > MAX_ORACLE_DECIMALS) {
            revert InvalidOracle();
        }
        if (maxAge_ == 0) revert InvalidMaxAge();

        uint8 actualDecimals;
        try IQuoteProofAggregator(oracle_).decimals() returns (uint8 decimals_) {
            actualDecimals = decimals_;
        } catch {
            revert OracleReadFailed();
        }
        if (actualDecimals != expectedDecimals_) revert UnexpectedDecimals(actualDecimals, expectedDecimals_);

        bytes32 descriptionHash;
        try IQuoteProofAggregator(oracle_).description() returns (string memory description) {
            descriptionHash = keccak256(bytes(description));
        } catch {
            revert OracleReadFailed();
        }
        if (descriptionHash != EXPECTED_DESCRIPTION_HASH) revert InvalidFeedDescription();

        oracle = oracle_;
        expectedDecimals = expectedDecimals_;
        maxAge = maxAge_;
    }

    function previewQuote(
        uint256 cents
    )
        external
        view
        returns (uint256 nonce, uint80 roundId, uint256 price, uint8 decimals, uint256 observedAt, uint256 tinybars)
    {
        if (cents < MIN_CENTS || cents > MAX_CENTS) revert InvalidCents();
        (roundId, price, decimals, observedAt) = _readFreshObservation();
        nonce = nonces[msg.sender];
        tinybars = _calculateTinybars(cents, price, decimals);
    }

    function createQuote(
        uint256 cents,
        uint80 expectedRound,
        uint256 expectedNonce
    ) external returns (bytes32 commitment) {
        if (cents < MIN_CENTS || cents > MAX_CENTS) revert InvalidCents();
        uint256 currentNonce = nonces[msg.sender];
        if (expectedNonce != currentNonce) revert PreviewNonceChanged(expectedNonce, currentNonce);

        (uint80 roundId, uint256 price, uint8 decimals, uint256 observedAt) = _readFreshObservation();
        if (roundId != expectedRound) revert PreviewRoundChanged(expectedRound, roundId);

        QuoteData memory quote;
        quote.schemaVersion = SCHEMA_VERSION;
        quote.chainId = block.chainid;
        quote.registry = address(this);
        quote.issuer = msg.sender;
        quote.nonce = currentNonce;
        quote.cents = cents;
        quote.oracle = oracle;
        quote.feedId = FEED_ID;
        quote.roundId = roundId;
        quote.price = price;
        quote.decimals = decimals;
        quote.observedAt = observedAt;
        quote.recordedAt = block.timestamp;
        quote.maximumAge = maxAge;
        quote.tinybars = _calculateTinybars(cents, price, decimals);
        commitment = _computeCommitment(quote);

        nonces[msg.sender] = currentNonce + 1;
        commitments[msg.sender][currentNonce] = commitment;

        _emitQuote(quote, commitment);
    }

    function getCommitment(address issuer, uint256 nonce) external view returns (bytes32) {
        return commitments[issuer][nonce];
    }

    function isStoredCommitment(address issuer, uint256 nonce, bytes32 commitment) external view returns (bool) {
        return commitments[issuer][nonce] == commitment && commitment != bytes32(0);
    }

    function _computeCommitment(QuoteData memory quote) internal pure returns (bytes32) {
        return keccak256(abi.encode(quote));
    }

    function _emitQuote(QuoteData memory quote, bytes32 commitment) internal {
        emit QuoteRecorded(commitment, quote);
    }

    function _readFreshObservation()
        internal
        view
        returns (uint80 roundId, uint256 price, uint8 decimals, uint256 observedAt)
    {
        try IQuoteProofAggregator(oracle).decimals() returns (uint8 actualDecimals) {
            decimals = actualDecimals;
        } catch {
            revert OracleReadFailed();
        }
        if (decimals != expectedDecimals || decimals > MAX_ORACLE_DECIMALS) {
            revert UnexpectedDecimals(decimals, expectedDecimals);
        }

        int256 signedPrice;
        uint256 startedAt;
        uint80 answeredInRound;
        try IQuoteProofAggregator(oracle).latestRoundData() returns (
            uint80 currentRoundId,
            int256 answer,
            uint256 currentStartedAt,
            uint256 currentUpdatedAt,
            uint80 currentAnsweredInRound
        ) {
            roundId = currentRoundId;
            signedPrice = answer;
            startedAt = currentStartedAt;
            observedAt = currentUpdatedAt;
            answeredInRound = currentAnsweredInRound;
        } catch {
            revert OracleReadFailed();
        }
        // Silence the deprecated field without making it part of the freshness rule.
        answeredInRound;
        startedAt;

        if (roundId == 0) revert InvalidRound();
        if (signedPrice <= 0) revert InvalidAnswer();
        if (observedAt == 0) revert InvalidObservationTime();
        if (observedAt > block.timestamp) revert FutureObservation();

        uint256 age = block.timestamp - observedAt;
        if (age > maxAge) revert StaleObservation(age, maxAge);
        price = uint256(signedPrice);
    }

    function _calculateTinybars(uint256 cents, uint256 price, uint8 decimals) internal pure returns (uint256) {
        uint256 numerator = cents * _pow10(uint256(decimals) + 6);
        uint256 quotient = numerator / price;
        if (numerator % price != 0) quotient += 1;
        return quotient;
    }

    function _pow10(uint256 exponent) internal pure returns (uint256 result) {
        result = 1;
        for (uint256 index = 0; index < exponent; index++) {
            result *= 10;
        }
    }
}
