import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { NFT_CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, AUCTION_ADDRESS } from "../contract/config";
import { fetchNFTMedia } from "../utils/nftMedia";
import { useToast } from "../context/ToastContext";

export default function MyNFTs({ nftContract, marketplace, auction, account, refreshKey, onListed }) {
  const [myTokens, setMyTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [priceInputs, setPriceInputs] = useState({});
  const [transferInputs, setTransferInputs] = useState({});
  const [auctionPriceInputs, setAuctionPriceInputs] = useState({});
  const [auctionDurationInputs, setAuctionDurationInputs] = useState({});
  const [status, setStatus] = useState("");
  const [auctionCheckError, setAuctionCheckError] = useState("");
  // tokenId -> true if an auction (ended === false) already exists for it on-chain.
  // This is what stops the "same token, two auctions" bug: the contract itself has
  // no uniqueness check, so we enforce "one active auction per token" in the UI.
  const [activeAuctionTokenIds, setActiveAuctionTokenIds] = useState(new Set());
  const { notify, update } = useToast();

  const loadMyNFTs = useCallback(async () => {
    if (!nftContract || !marketplace || !account) return;
    setLoading(true);
    try {
      // 1. Find every token owned by this account
      const total = Number(await nftContract.tokenCounter());
      const owned = [];
      for (let tokenId = 1; tokenId <= total; tokenId++) {
        try {
          const owner = await nftContract.ownerOf(tokenId);
          if (owner.toLowerCase() === account.toLowerCase()) {
            const uri = await nftContract.tokenURI(tokenId);
            owned.push({ tokenId, uri, listingId: null, price: null, image: null, name: null });
          }
        } catch (_) {
          // token doesn't exist / burned - skip
        }
      }

      // 2. Find active listings for those tokens (marketplace is listingId-keyed, not tokenId-keyed)
      const listingCount = Number(await marketplace.listingCounter());
      for (let listingId = 1; listingId <= listingCount; listingId++) {
        const listing = await marketplace.getListing(listingId);
        if (
          listing.active &&
          !listing.sold &&
          listing.nftContract.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()
        ) {
          const match = owned.find((t) => t.tokenId === Number(listing.tokenId));
          if (match) {
            match.listingId = Number(listing.listingId);
            match.price = listing.price;
          }
        }
      }

      setMyTokens(owned);

      // 3. Resolve images in the background, one at a time, updating as they arrive
      owned.forEach(async (nft) => {
        const media = await fetchNFTMedia(nft.uri);
        setMyTokens((prev) =>
          prev.map((t) =>
            t.tokenId === nft.tokenId ? { ...t, ...media, mediaFailed: media.failed } : t
          )
        );
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [nftContract, marketplace, account]);

  const loadActiveAuctionTokenIds = useCallback(async () => {
    if (!auction || myTokens.length === 0) {
      setActiveAuctionTokenIds(new Set());
      return;
    }
    try {
      const results = await Promise.all(
        myTokens.map((t) => auction.activeAuctionId(NFT_CONTRACT_ADDRESS, t.tokenId))
      );
      const ids = new Set();
      myTokens.forEach((t, i) => {
        if (Number(results[i]) !== 0) ids.add(t.tokenId);
      });
      setActiveAuctionTokenIds(ids);
      setAuctionCheckError("");
    } catch (err) {
      console.error(err);
      setAuctionCheckError(
        "Couldn't check for existing auctions on this NFT — AUCTION_ADDRESS in config.js may not match your latest deployed NFTAuction contract. The Start Auction form below may let you attempt a duplicate; if so it will be rejected on-chain."
      );
    }
  }, [auction, myTokens]);

  useEffect(() => {
    loadMyNFTs();
    loadActiveAuctionTokenIds();
  }, [loadMyNFTs, loadActiveAuctionTokenIds, refreshKey]);

  const handleListNFT = async (tokenId) => {
    const price = priceInputs[tokenId];
    if (!price || Number(price) <= 0) {
      setStatus("Enter a valid price in ETH.");
      return;
    }
    const toastId = notify({ type: "pending", message: `Approving marketplace for token #${tokenId}...` });
    try {
      setStatus(`Approving marketplace for token #${tokenId}...`);
      const approveTx = await nftContract.approve(MARKETPLACE_ADDRESS, tokenId);
      await approveTx.wait();

      update(toastId, { type: "pending", message: `Listing token #${tokenId}...` });
      setStatus(`Listing token #${tokenId}...`);
      const priceWei = ethers.parseEther(price.toString());
      const listTx = await marketplace.listNFT(NFT_CONTRACT_ADDRESS, tokenId, priceWei);
      await listTx.wait();

      setStatus(`Token #${tokenId} listed for ${price} ETH.`);
      update(toastId, { type: "success", message: `Token #${tokenId} listed for ${price} ETH!` });
      loadMyNFTs();
      if (onListed) onListed();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Listing failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  const handleCancel = async (listingId, tokenId) => {
    const toastId = notify({ type: "pending", message: `Confirm cancelling listing for token #${tokenId}...` });
    try {
      setStatus(`Cancelling listing for token #${tokenId}...`);
      const tx = await marketplace.cancelListing(listingId);
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Listing cancelled for token #${tokenId}.`);
      update(toastId, { type: "success", message: `Listing cancelled for token #${tokenId}.` });
      loadMyNFTs();
      if (onListed) onListed();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Cancel failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  const handleStartAuction = async (tokenId) => {
    if (activeAuctionTokenIds.has(tokenId)) {
      setStatus(
        `Token #${tokenId} already has an active auction. Check the Auctions tab — cancel or wait for it to end before starting a new one.`
      );
      notify({
        type: "error",
        message: `Token #${tokenId} already has an active auction — check the Auctions tab.`,
      });
      return;
    }

    const startingPrice = auctionPriceInputs[tokenId];
    const durationDays = auctionDurationInputs[tokenId];

    if (!startingPrice || Number(startingPrice) <= 0) {
      setStatus("Enter a valid starting price in ETH.");
      return;
    }
    if (!durationDays || Number(durationDays) <= 0) {
      setStatus("Enter a valid auction duration in days.");
      return;
    }
    if (!auction) {
      setStatus("Auction contract not available — check AUCTION_ADDRESS in config.js.");
      return;
    }

    const toastId = notify({ type: "pending", message: `Approving auction contract for token #${tokenId}...` });
    try {
      setStatus(`Approving auction contract for token #${tokenId}...`);
      const approveTx = await nftContract.approve(AUCTION_ADDRESS, tokenId);
      await approveTx.wait();

      update(toastId, { type: "pending", message: `Starting auction for token #${tokenId}...` });
      setStatus(`Starting auction for token #${tokenId}...`);
      const priceWei = ethers.parseEther(startingPrice.toString());
      const durationSeconds = Math.floor(Number(durationDays) * 86400);
      const tx = await auction.createAuction(NFT_CONTRACT_ADDRESS, tokenId, priceWei, durationSeconds);
      await tx.wait();

      setStatus(`Auction started for token #${tokenId}. Check the Auctions tab.`);
      update(toastId, { type: "success", message: `Auction started for token #${tokenId}!` });
      loadMyNFTs();
      loadActiveAuctionTokenIds();
      if (onListed) onListed();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Starting auction failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  const handleTransfer = async (tokenId) => {
    const to = (transferInputs[tokenId] || "").trim();
    if (!ethers.isAddress(to)) {
      setStatus("Enter a valid wallet address to send to.");
      return;
    }
    if (
      to.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase() ||
      to.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()
    ) {
      setStatus(
        "That's a contract address, not a wallet address — sending here would permanently lock the NFT. Paste a normal wallet (0x...) address instead."
      );
      return;
    }
    if (to.toLowerCase() === account.toLowerCase()) {
      setStatus("That's your own address — nothing to send.");
      return;
    }
    const toastId = notify({ type: "pending", message: `Confirm sending token #${tokenId}...` });
    try {
      setStatus(`Sending token #${tokenId} to ${to}...`);
      const tx = await nftContract.safeTransferFrom(account, to, tokenId);
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Token #${tokenId} sent to ${to}.`);
      update(toastId, { type: "success", message: `Token #${tokenId} sent successfully!` });
      setTransferInputs({ ...transferInputs, [tokenId]: "" });
      loadMyNFTs();
      if (onListed) onListed();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Transfer failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  if (!account) return null;

  return (
    <div className="card">
      <h2>My NFTs</h2>
      {loading && <p className="muted">Loading your NFTs...</p>}
      {!loading && myTokens.length === 0 && (
        <p className="muted">You don't own any NFTs yet. Mint one above.</p>
      )}
      {status && <p className="status">{status}</p>}
      {auctionCheckError && <div className="banner banner-warning">{auctionCheckError}</div>}

      <div className="grid">
        {myTokens.map((nft) => (
          <div className="nft-card" key={nft.tokenId}>
            {nft.image ? (
              <img className="nft-image" src={nft.image} alt={nft.name || `Token #${nft.tokenId}`} />
            ) : nft.mediaFailed ? (
              <div className="nft-image nft-image-placeholder">Image unavailable</div>
            ) : (
              <div className="nft-image nft-image-placeholder">Loading image...</div>
            )}
            <div className="nft-card-header">{nft.name || `Token #${nft.tokenId}`}</div>
            <p className="muted small">{nft.uri}</p>

            {nft.listingId ? (
              <>
                <p>Listed for {ethers.formatEther(nft.price)} ETH</p>
                <button
                  className="btn btn-outline"
                  onClick={() => handleCancel(nft.listingId, nft.tokenId)}
                >
                  Cancel Listing
                </button>
              </>
            ) : (
              <>
                <div className="form-row">
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Price in ETH"
                    value={priceInputs[nft.tokenId] || ""}
                    onChange={(e) =>
                      setPriceInputs({ ...priceInputs, [nft.tokenId]: e.target.value })
                    }
                  />
                  <button className="btn btn-primary" onClick={() => handleListNFT(nft.tokenId)}>
                    List for Sale
                  </button>
                </div>

                <div className="form-row">
                  <input
                    type="text"
                    placeholder="Recipient address (0x...)"
                    value={transferInputs[nft.tokenId] || ""}
                    onChange={(e) =>
                      setTransferInputs({ ...transferInputs, [nft.tokenId]: e.target.value })
                    }
                  />
                  <button className="btn btn-outline" onClick={() => handleTransfer(nft.tokenId)}>
                    Send
                  </button>
                </div>

                {activeAuctionTokenIds.has(nft.tokenId) ? (
                  <p className="auction-note">
                    This token already has an active auction. Check the Auctions tab to bid, end,
                    or cancel it before starting a new one.
                  </p>
                ) : (
                  <div className="form-row">
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="Starting price in ETH"
                      value={auctionPriceInputs[nft.tokenId] || ""}
                      onChange={(e) =>
                        setAuctionPriceInputs({ ...auctionPriceInputs, [nft.tokenId]: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Duration (days)"
                      value={auctionDurationInputs[nft.tokenId] || ""}
                      onChange={(e) =>
                        setAuctionDurationInputs({ ...auctionDurationInputs, [nft.tokenId]: e.target.value })
                      }
                    />
                    <button className="btn btn-outline" onClick={() => handleStartAuction(nft.tokenId)}>
                      Start Auction
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
