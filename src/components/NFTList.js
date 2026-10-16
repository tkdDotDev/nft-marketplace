import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { fetchNFTMedia } from "../utils/nftMedia";
import { useToast } from "../context/ToastContext";

export default function NFTList({ nftContract, marketplace, account, refreshKey, onPurchased }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const { notify, update } = useToast();

  const loadListings = useCallback(async () => {
    if (!marketplace || !nftContract) return;
    setLoading(true);
    try {
      const listingCount = Number(await marketplace.listingCounter());
      const active = [];

      for (let listingId = 1; listingId <= listingCount; listingId++) {
        const listing = await marketplace.getListing(listingId);
        if (listing.active && !listing.sold) {
          let uri = "";
          try {
            uri = await nftContract.tokenURI(listing.tokenId);
          } catch (_) {}
          active.push({
            listingId: Number(listing.listingId),
            tokenId: Number(listing.tokenId),
            seller: listing.seller,
            price: listing.price,
            uri,
            image: null,
            name: null,
          });
        }
      }
      setItems(active);

      // Resolve images in the background as they arrive
      active.forEach(async (item) => {
        const media = await fetchNFTMedia(item.uri);
        setItems((prev) =>
          prev.map((it) =>
            it.listingId === item.listingId ? { ...it, ...media, mediaFailed: media.failed } : it
          )
        );
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [marketplace, nftContract]);

  useEffect(() => {
    loadListings();
  }, [loadListings, refreshKey]);

  const handleBuy = async (listingId, price) => {
    if (!account) {
      setStatus("Connect your wallet first.");
      return;
    }
    const toastId = notify({ type: "pending", message: `Confirm purchase of listing #${listingId} in your wallet...` });
    try {
      setStatus(`Buying listing #${listingId}...`);
      const tx = await marketplace.buyNFT(listingId, { value: price });
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Listing #${listingId} purchased successfully.`);
      update(toastId, { type: "success", message: `Listing #${listingId} purchased successfully!` });
      loadListings();
      if (onPurchased) onPurchased();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Purchase failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  return (
    <div className="card">
      <h2>Marketplace</h2>
      {loading && <p className="muted">Loading listings...</p>}
      {!loading && items.length === 0 && <p className="muted">No NFTs listed for sale right now.</p>}
      {status && <p className="status">{status}</p>}

      <div className="grid">
        {items.map((item) => (
          <div className="nft-card" key={item.listingId}>
            {item.image ? (
              <img className="nft-image" src={item.image} alt={item.name || `Token #${item.tokenId}`} />
            ) : item.mediaFailed ? (
              <div className="nft-image nft-image-placeholder">Image unavailable</div>
            ) : (
              <div className="nft-image nft-image-placeholder">Loading image...</div>
            )}
            <div className="nft-card-header">{item.name || `Token #${item.tokenId}`}</div>
            <p className="muted small">
              Seller: {item.seller.slice(0, 6)}...{item.seller.slice(-4)}
            </p>
            <p className="price">{ethers.formatEther(item.price)} ETH</p>
            <button
              className="btn btn-primary"
              onClick={() => handleBuy(item.listingId, item.price)}
              disabled={account && item.seller.toLowerCase() === account.toLowerCase()}
            >
              {account && item.seller.toLowerCase() === account.toLowerCase()
                ? "Your listing"
                : "Buy Now"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
