// 1. Paste your three deployed contract addresses here (from Remix "Deployed Contracts")
export const NFT_CONTRACT_ADDRESS =
  "0x9e702a3De4936Dc09Bb481330F82a122FA755CEe"; // MyNFT
export const MARKETPLACE_ADDRESS = "0x71539298E9E8411Eb66C6B4FD8771774Df6EA0B0"; // NFTMarketplace
export const AUCTION_ADDRESS = "0x0fb7D6089263F867EeA229f1FA00F0041c4b3287"; // NFTAuction
// export const AUCTION_ADDRESS = "0xB81b17EeF78B68F1f9D554D396AF8A5417116B8a"; // NFTAuction

// 2. ABI matching contracts/MyNFT.sol
export const NFT_ABI = [
  "function mintNFT(address to, string memory tokenURI) public returns (uint256)",
  "function tokenCounter() public view returns (uint256)",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenURI(uint256 tokenId) public view returns (string memory)",
  "function approve(address to, uint256 tokenId) public",
  "function getApproved(uint256 tokenId) public view returns (address)",
  "function isApprovedForAll(address owner, address operator) public view returns (bool)",
  "function setApprovalForAll(address operator, bool approved) public",
  "function safeTransferFrom(address from, address to, uint256 tokenId) public",
];

// 3. ABI matching contracts/NFTMarketplace.sol
export const MARKETPLACE_ABI = [
  "function listingCounter() public view returns (uint256)",
  "function listNFT(address nftContract, uint256 tokenId, uint256 price) public",
  "function buyNFT(uint256 listingId) public payable",
  "function cancelListing(uint256 listingId) public",
  "function getListing(uint256 listingId) public view returns (tuple(uint256 listingId, address nftContract, uint256 tokenId, address seller, uint256 price, bool sold, bool active))",
  "event NFTListed(uint256 indexed listingId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 price)",
  "event NFTSold(uint256 indexed listingId, address buyer)",
  "event ListingCancelled(uint256 indexed listingId)",
];

// 4. ABI matching contracts/NFTAuction.sol
// NOTE: this must match the struct field order in the ACTUAL deployed contract
// exactly, or ethers will fail to decode getAuction() results.
export const AUCTION_ABI = [
  "function auctionCounter() public view returns (uint256)",
  "function createAuction(address nftContract, uint256 tokenId, uint256 startingPrice, uint256 durationInSeconds) external returns (uint256)",
  "function placeBid(uint256 auctionId) external payable",
  "function endAuction(uint256 auctionId) external",
  "function cancelAuction(uint256 auctionId) external",
  "function getAuction(uint256 auctionId) external view returns (tuple(uint256 auctionId, address nftContract, uint256 tokenId, address seller, uint256 startingPrice, uint256 highestBid, address highestBidder, uint256 endTime, bool ended, bool active))",
  "function activeAuctionId(address nftContract, uint256 tokenId) public view returns (uint256)",
  "function timeRemaining(uint256 auctionId) external view returns (uint256)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed nftContract, uint256 indexed tokenId, address seller, uint256 startingPrice, uint256 endTime)",
  "event BidPlaced(uint256 indexed auctionId, address bidder, uint256 amount)",
  "event AuctionEnded(uint256 indexed auctionId, address winner, uint256 amount)",
  "event AuctionCancelled(uint256 indexed auctionId)",
];
