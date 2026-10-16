// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTMarketplace is Ownable {
    uint256 public listingCounter;

    struct Listing {
        uint256 listingId;
        address nftContract;
        uint256 tokenId;
        address payable seller;
        uint256 price;
        bool sold;
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    event NFTListed(
        uint256 indexed listingId,
        address indexed nftContract,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );

    event NFTSold(
        uint256 indexed listingId,
        address buyer
    );

    event ListingCancelled(uint256 indexed listingId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) public {
        require(price > 0, "Price must be greater than 0");

        IERC721 nft = IERC721(nftContract);

        require(nft.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // Marketplace contract must be approved before transfer
        require(
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        listingCounter++;

        listings[listingCounter] = Listing({
            listingId: listingCounter,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: payable(msg.sender),
            price: price,
            sold: false,
            active: true
        });

        emit NFTListed(listingCounter, nftContract, tokenId, msg.sender, price);
    }

    function buyNFT(uint256 listingId) public payable {
        Listing storage item = listings[listingId];

        require(item.active, "Listing not active");
        require(!item.sold, "NFT already sold");
        require(msg.value == item.price, "Incorrect ETH amount");

        item.sold = true;
        item.active = false;

        // transfer ETH to seller
        item.seller.transfer(msg.value);

        // transfer NFT to buyer
        IERC721(item.nftContract).safeTransferFrom(
            item.seller,
            msg.sender,
            item.tokenId
        );

        emit NFTSold(listingId, msg.sender);
    }

    function cancelListing(uint256 listingId) public {
        Listing storage item = listings[listingId];

        require(item.active, "Listing not active");
        require(item.seller == msg.sender, "Not seller");

        item.active = false;

        emit ListingCancelled(listingId);
    }

    function getListing(uint256 listingId) public view returns (Listing memory) {
        return listings[listingId];
    }
}
