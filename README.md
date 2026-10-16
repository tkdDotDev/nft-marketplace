# NFT Marketplace (ERC-721) — Remix + React

Three contracts, deployed separately in Remix:
- **MyNFT.sol** — the ERC-721 token itself (mint)
- **NFTMarketplace.sol** — a standalone marketplace that lists/buys/cancels any `IERC721` token by address + tokenId
- **NFTAuction.sol** — English-auction bidding: seller starts a timed auction, buyers bid, highest bid wins when time runs out

Frontend is plain React + ethers.js and already wired up for this three-contract design.

## Project structure

```
nft-marketplace/
├── contracts/
│   ├── MyNFT.sol              # Deploy first
│   ├── NFTMarketplace.sol     # Deploy second
│   └── NFTAuction.sol         # Deploy third
├── src/
│   ├── contract/config.js     # All three addresses + ABIs go here
│   ├── components/
│   │   ├── ConnectWallet.js
│   │   ├── MintNFT.js
│   │   ├── MyNFTs.js
│   │   ├── NFTList.js
│   │   └── AuctionList.js
│   ├── App.js
│   ├── App.css
│   └── index.js
├── public/index.html
└── package.json
```

---

## STEP 1 — Deploy both contracts in Remix

1. Go to https://remix.ethereum.org and create two files:
   `MyNFT.sol` and `NFTMarketplace.sol`, pasting in the matching files from
   `contracts/` in this project.
2. **Solidity Compiler** tab → set version to `0.8.27` (or any ≥0.8.20 that supports it) →
   compile both files.
3. **Deploy & Run Transactions** tab:
   - **Environment**: **Injected Provider - MetaMask**, with MetaMask on a testnet (e.g.
     Sepolia) and funded with test ETH from a faucet.
   - **Deploy MyNFT first**: select `MyNFT` in the contract dropdown. Its constructor
     takes `initialOwner` — enter your own wallet address. Click **Deploy**, confirm in
     MetaMask, then copy the deployed address.
   - **Deploy NFTMarketplace second**: select `NFTMarketplace`. Its constructor also
     takes `initialOwner` — again your wallet address. Deploy, confirm, copy the address.
   - **Deploy NFTAuction third**: add `NFTAuction.sol` to Remix, compile, select
     `NFTAuction` in the dropdown. Its constructor takes `initialOwner` — same as the
     other two, enter your own wallet address. Click **Deploy**, confirm, and copy the
     address.

You should end up with three different addresses — one per contract. (Yours, from this
conversation: MyNFT `0x9e702a3De4936Dc09Bb481330F82a122FA755CEe`, NFTMarketplace
`0x71539298E9E8411Eb66C6B4FD8771774Df6EA0B0` — already filled into `config.js` below.
You'll need to paste in your own `NFTAuction` address after deploying it — it isn't
filled in yet. **If you're upgrading from an earlier version of this contract, you must
redeploy** — the duplicate-auction protection below is enforced in the contract code
itself, so it only takes effect on a fresh deployment.)

> Note: this `NFTAuction` follows the **same approval-based pattern as `NFTMarketplace`** —
> it never takes ownership of the NFT. The seller keeps the token (and it still shows up
> under "My NFTs") for the entire auction; the contract only needs **approval** to move
> it, which it uses once at `endAuction` time to send the NFT to the winner. This means
> a seller *could* technically transfer the NFT elsewhere mid-auction, which would make
> `endAuction` revert for the winner — worth keeping in mind if you extend this further,
> though it mirrors how the marketplace listing already behaves.
>
> Also: **a token can only have one live auction at a time.** `createAuction` checks an
> on-chain `activeAuctionId[nftContract][tokenId]` mapping and reverts with "An active
> auction already exists for this NFT" if one's already running — this is enforced by
> the contract itself, not just the frontend, so it holds even if two people try to
> auction the same NFT from different tabs at the same moment.

---

## STEP 2 — Get NFT metadata ready (for minting)

Each NFT needs a `tokenURI` pointing to JSON like:

```json
{
  "name": "My First NFT",
  "description": "A test NFT for my marketplace",
  "image": "ipfs://<your-image-cid>"
}
```

Use **NFT.Storage** (https://nft.storage) or **Pinata** (https://pinata.cloud) to upload
the image, then the JSON referencing it, and grab the metadata's IPFS URI. Any public
`.json` URL also works for quick testing.

---

## STEP 3 — Set up the React frontend

1. Node.js v18+ required.
2. From the `nft-marketplace` folder:
   ```bash
   npm install
   ```
3. Open `src/contract/config.js` — MyNFT and NFTMarketplace are already pre-filled:
   ```js
   export const NFT_CONTRACT_ADDRESS = "0x9e702a3De4936Dc09Bb481330F82a122FA755CEe";
   export const MARKETPLACE_ADDRESS = "0x71539298E9E8411Eb66C6B4FD8771774Df6EA0B0";
   export const AUCTION_ADDRESS = "PASTE_YOUR_DEPLOYED_NFTAUCTION_ADDRESS_HERE"; // ← replace this
   ```
   Paste your own deployed `NFTAuction` address in place of the placeholder. Double
   check all three against Remix's "Deployed Contracts" copy-address button if
   anything doesn't work — a single mistyped character will make every call revert.
4. Run it:
   ```bash
   npm start
   ```
   Opens at http://localhost:3000.

---

## STEP 4 — Use the marketplace

1. **Connect Wallet** — MetaMask must be on the same network you deployed to.
2. **Mint tab** — paste a metadata URI → **Mint NFT**. This calls
   `MyNFT.mintNFT(yourAddress, tokenURI)`.
3. **My NFTs tab** — shows tokens you own (found by scanning `tokenCounter` and checking
   `ownerOf`). Enter a price and click **List for Sale** — this fires two transactions:
   - `MyNFT.approve(marketplaceAddress, tokenId)`
   - `NFTMarketplace.listNFT(nftContractAddress, tokenId, priceInWei)`
4. **Marketplace tab** — anyone connected sees all active listings (scanned via
   `listingCounter` + `getListing`) and can **Buy Now**, which calls
   `NFTMarketplace.buyNFT(listingId)` sending exactly the listed price. The contract
   pays the seller directly and transfers the NFT via `safeTransferFrom`.
5. **Cancel Listing** (My NFTs tab) calls `NFTMarketplace.cancelListing(listingId)` for
   anything you've listed but not sold.
6. **Start Auction** (My NFTs tab) — enter a starting price (ETH) and duration (days),
   then click **Start Auction**. This fires two transactions:
   - `MyNFT.approve(auctionAddress, tokenId)`
   - `NFTAuction.createAuction(nftContractAddress, tokenId, startingPriceInWei, durationInSeconds)`
   The NFT moves into escrow in the auction contract immediately.
7. **Auctions tab** — anyone connected sees all open auctions (scanned via
   `auctionCounter` + `getAuction`), each with a live countdown. Enter a bid that beats
   the current highest (or meets the starting price if there are no bids yet) and click
   **Place Bid** — this calls `NFTAuction.placeBid(auctionId)`. The previous highest
   bidder is refunded automatically by the contract.
8. **Ending an auction** — once the countdown hits zero, an **End Auction** button
   appears for anyone to click (not just the seller). This calls
   `NFTAuction.endAuction(auctionId)`, which sends the NFT to the winner and the ETH to
   the seller — or, if nobody bid, simply returns the NFT to the seller.

---

## How the contracts work (quick reference)

**MyNFT.sol**

| Function | What it does |
|---|---|
| `mintNFT(to, tokenURI)` | Mints a new token to `to` with the given metadata URI |
| `tokenCounter()` | Total tokens minted so far |
| `approve(operator, tokenId)` | Lets the marketplace move a specific token |

**NFTMarketplace.sol**

| Function | What it does |
|---|---|
| `listNFT(nftContract, tokenId, price)` | Lists any approved ERC-721 token for sale |
| `buyNFT(listingId)` | Pays `price` in ETH, transfers the NFT, pays the seller |
| `cancelListing(listingId)` | Seller removes their own listing |
| `getListing(listingId)` | Returns the full `Listing` struct |
| `listingCounter()` | Total listings ever created (active + inactive) |

**NFTAuction.sol**

| Function | What it does |
|---|---|
| `createAuction(nftContract, tokenId, startingPrice, durationInSeconds)` | Starts a timed auction; reverts if this NFT already has a live one |
| `placeBid(auctionId)` | Pays ETH ≥ the required minimum; refunds the previous highest bidder |
| `endAuction(auctionId)` | After the duration elapses: pays the seller + sends the NFT straight to the winner (or just closes out if there were no bids) |
| `cancelAuction(auctionId)` | Seller reclaims control, only allowed if no bids have been placed yet |
| `getAuction(auctionId)` | Returns the full `Auction` struct — `startingPrice` is never overwritten, so it's always readable here regardless of bids |
| `activeAuctionId(nftContract, tokenId)` | Returns the live auction's ID for that NFT, or `0` if none — this is what blocks duplicate auctions |
| `timeRemaining(auctionId)` | Seconds left, `0` once expired |
| `auctionCounter()` | Total auctions ever created |

## Notes & next steps

- Because this marketplace works with **any** `IERC721` contract, you could later
  point `listNFT` / `createAuction` at a different NFT collection without redeploying.
- `NFTMarketplace` has no reentrancy guard, but follows checks-effects-interactions
  ordering. `NFTAuction` adds an explicit `nonReentrant` modifier on `placeBid` and
  `endAuction`, since both make outgoing ETH transfers via a checked `.call()` rather
  than the safer-but-more-limited `.transfer()`. For production, consider OpenZeppelin's
  `ReentrancyGuard` on both contracts as defense in depth.
- Scanning all tokens/listings in a loop is fine for a demo; for a real app
  with many NFTs, index events off-chain (e.g. via a subgraph) instead. The one
  exception already fixed here: checking whether a token has a live auction no longer
  loops over every auction ever created — it's a single `activeAuctionId` lookup.
- `endAuction` is callable by **anyone**, not just the seller — this is intentional so
  an auction doesn't get stuck waiting on the seller to show up after time runs out.
