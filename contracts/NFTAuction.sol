// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTAuction is Ownable {
    uint256 public auctionCounter;

    struct Auction {
        uint256 auctionId;
        address nftContract;
        uint256 tokenId;
        address payable seller;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool ended;
        bool active;
    }

    mapping(uint256 => Auction) public auctions;

    // nftContract => tokenId => id of the currently active (not-yet-ended) auction, or 0
    // if none exists. This is enforced on-chain in createAuction() so the same NFT can
    // never end up with two live auctions at once, no matter what the frontend does.
    mapping(address => mapping(uint256 => uint256)) public activeAuctionId;

    bool private locked;
    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 startingPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address bidder,
        uint256 amount
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address winner,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed auctionId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Start an auction. Reverts if this exact NFT already has a live auction.
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        uint256 durationInSeconds
    ) external returns (uint256) {
        require(startingPrice > 0, "Starting price must be > 0");
        require(durationInSeconds > 0, "Duration must be > 0");
        require(
            activeAuctionId[nftContract][tokenId] == 0,
            "An active auction already exists for this NFT"
        );

        IERC721 nft = IERC721(nftContract);

        require(nft.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        require(
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Auction contract not approved"
        );

        auctionCounter++;
        uint256 newAuctionId = auctionCounter;

        auctions[newAuctionId] = Auction({
            auctionId: newAuctionId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: payable(msg.sender),
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + durationInSeconds,
            ended: false,
            active: true
        });

        activeAuctionId[nftContract][tokenId] = newAuctionId;

        emit AuctionCreated(
            newAuctionId,
            nftContract,
            tokenId,
            msg.sender,
            startingPrice,
            block.timestamp + durationInSeconds
        );

        return newAuctionId;
    }

    /// @notice Place a bid. startingPrice is never overwritten by this — it's a separate
    ///         field from highestBid for the lifetime of the auction, so the original
    ///         starting price always stays readable via getAuction() regardless of bids.
    function placeBid(uint256 auctionId) external payable nonReentrant {
        Auction storage a = auctions[auctionId];

        require(a.active, "Auction not active");
        require(!a.ended, "Auction ended");
        require(block.timestamp < a.endTime, "Auction expired");
        require(msg.sender != a.seller, "Seller cannot bid");

        uint256 minBid = a.highestBid == 0 ? a.startingPrice : a.highestBid + 1;
        require(msg.value >= minBid, "Bid below minimum");

        address previousBidder = a.highestBidder;
        uint256 previousBid = a.highestBid;

        a.highestBid = msg.value;
        a.highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, msg.value);

        // Refund the previous highest bidder after state is already updated
        // (checks-effects-interactions), using a checked call instead of .transfer().
        if (previousBidder != address(0)) {
            (bool refunded, ) = payable(previousBidder).call{value: previousBid}("");
            require(refunded, "Refund to previous bidder failed");
        }
    }

    /// @notice Settle an auction once its duration has elapsed. Sends the NFT straight to
    ///         the highest bidder and the ETH straight to the seller — or, if nobody bid,
    ///         just closes it out with no transfer.
    function endAuction(uint256 auctionId) external nonReentrant {
        Auction storage a = auctions[auctionId];

        require(a.active, "Auction not active");
        require(!a.ended, "Auction already ended");
        require(block.timestamp >= a.endTime, "Auction still running");

        a.ended = true;
        a.active = false;
        delete activeAuctionId[a.nftContract][a.tokenId];

        IERC721 nft = IERC721(a.nftContract);

        if (a.highestBidder != address(0)) {
            (bool paid, ) = a.seller.call{value: a.highestBid}("");
            require(paid, "ETH transfer to seller failed");

            nft.safeTransferFrom(a.seller, a.highestBidder, a.tokenId);

            emit AuctionEnded(auctionId, a.highestBidder, a.highestBid);
        } else {
            emit AuctionEnded(auctionId, address(0), 0);
        }
    }

    /// @notice Seller can cancel and free up the token for a new auction, but only
    ///         before any bid has been placed.
    function cancelAuction(uint256 auctionId) external {
        Auction storage a = auctions[auctionId];

        require(a.active, "Auction not active");
        require(!a.ended, "Auction already ended");
        require(msg.sender == a.seller, "Not seller");
        require(a.highestBidder == address(0), "Cannot cancel after bid");

        a.active = false;
        a.ended = true;
        delete activeAuctionId[a.nftContract][a.tokenId];

        emit AuctionCancelled(auctionId);
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function timeRemaining(uint256 auctionId) external view returns (uint256) {
        Auction storage a = auctions[auctionId];
        if (block.timestamp >= a.endTime) return 0;
        return a.endTime - block.timestamp;
    }
}
