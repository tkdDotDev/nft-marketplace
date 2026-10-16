import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { fetchNFTMedia } from "../utils/nftMedia";
import { useToast } from "../context/ToastContext";

// Formats seconds left into "1d 4h 12m" / "3h 2m" / "45s" style text.
function formatTimeLeft(totalSeconds) {
  if (totalSeconds <= 0) return "Ended";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function AuctionList({ nftContract, auction, account, refreshKey, onAuctionUpdated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bidInputs, setBidInputs] = useState({});
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [bidHistory, setBidHistory] = useState({});
  const [historyOpen, setHistoryOpen] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const { notify, update } = useToast();

  // Tick every second so countdowns move without re-fetching from chain.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAuctions = useCallback(async () => {
    if (!auction || !nftContract) return;
    setLoading(true);
    setLoadError("");
    try {
      const count = Number(await auction.auctionCounter());
      const all = [];

      for (let auctionId = 1; auctionId <= count; auctionId++) {
        const a = await auction.getAuction(auctionId);
        if (!a.ended) {
          let uri = "";
          try {
            uri = await nftContract.tokenURI(a.tokenId);
          } catch (_) {}
          all.push({
            auctionId,
            seller: a.seller,
            nftContract: a.nftContract,
            tokenId: Number(a.tokenId),
            highestBidder: a.highestBidder,
            highestBid: a.highestBid,
            startingPrice: a.startingPrice,
            endTime: Number(a.endTime),
            uri,
            image: null,
            name: null,
          });
        }
      }
      setItems(all);

      all.forEach(async (item) => {
        const media = await fetchNFTMedia(item.uri);
        setItems((prev) =>
          prev.map((it) =>
            it.auctionId === item.auctionId ? { ...it, ...media, mediaFailed: media.failed } : it
          )
        );
      });
    } catch (err) {
      console.error(err);
      setLoadError(
        "Failed to load auctions. This usually means AUCTION_ADDRESS in config.js doesn't match your latest deployed NFTAuction contract — redeploy and update it if you've changed the contract recently."
      );
    } finally {
      setLoading(false);
    }
  }, [auction, nftContract]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions, refreshKey]);

  const toggleHistory = async (auctionId) => {
    const isOpen = historyOpen[auctionId];
    if (isOpen) {
      setHistoryOpen({ ...historyOpen, [auctionId]: false });
      return;
    }
    setHistoryOpen({ ...historyOpen, [auctionId]: true });

    setHistoryLoading((prev) => ({ ...prev, [auctionId]: true }));
    try {
      const events = await auction.queryFilter(auction.filters.BidPlaced(auctionId));
      const list = events
        .map((e) => ({
          bidder: e.args.bidder,
          amount: e.args.amount,
        }))
        .reverse(); // most recent first
      setBidHistory((prev) => ({ ...prev, [auctionId]: list }));
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading((prev) => ({ ...prev, [auctionId]: false }));
    }
  };

  const handleBid = async (auctionId, minRequired) => {
    if (!account) {
      setStatus("Connect your wallet first.");
      return;
    }
    const bidValue = bidInputs[auctionId];
    if (!bidValue || Number(bidValue) <= 0) {
      setStatus("Enter a valid bid amount in ETH.");
      return;
    }
    const bidWei = ethers.parseEther(bidValue.toString());
    if (bidWei < minRequired) {
      setStatus(`Bid must be at least ${ethers.formatEther(minRequired)} ETH.`);
      return;
    }
    const toastId = notify({ type: "pending", message: `Confirm your bid on auction #${auctionId}...` });
    try {
      setStatus(`Placing bid on auction #${auctionId}...`);
      const tx = await auction.placeBid(auctionId, { value: bidWei });
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Bid placed on auction #${auctionId}.`);
      update(toastId, { type: "success", message: `Bid placed on auction #${auctionId}!` });
      setBidInputs({ ...bidInputs, [auctionId]: "" });
      // Bid history is stale now if it was open — force a refetch next toggle.
      setBidHistory((prev) => {
        const next = { ...prev };
        delete next[auctionId];
        return next;
      });
      if (historyOpen[auctionId]) toggleHistoryRefresh(auctionId);
      loadAuctions();
      if (onAuctionUpdated) onAuctionUpdated();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Bid failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  // Re-fetch bid history in place (used right after a new bid lands) without toggling it closed.
  const toggleHistoryRefresh = async (auctionId) => {
    try {
      const events = await auction.queryFilter(auction.filters.BidPlaced(auctionId));
      const list = events.map((e) => ({ bidder: e.args.bidder, amount: e.args.amount })).reverse();
      setBidHistory((prev) => ({ ...prev, [auctionId]: list }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleEndAuction = async (auctionId) => {
    const toastId = notify({ type: "pending", message: `Confirm ending auction #${auctionId}...` });
    try {
      setStatus(`Ending auction #${auctionId}...`);
      const tx = await auction.endAuction(auctionId);
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Auction #${auctionId} ended.`);
      update(toastId, { type: "success", message: `Auction #${auctionId} ended!` });
      loadAuctions();
      if (onAuctionUpdated) onAuctionUpdated();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Ending auction failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  const handleCancelAuction = async (auctionId) => {
    const toastId = notify({ type: "pending", message: `Confirm cancelling auction #${auctionId}...` });
    try {
      setStatus(`Cancelling auction #${auctionId}...`);
      const tx = await auction.cancelAuction(auctionId);
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus(`Auction #${auctionId} cancelled.`);
      update(toastId, { type: "success", message: `Auction #${auctionId} cancelled.` });
      loadAuctions();
      if (onAuctionUpdated) onAuctionUpdated();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Cancelling auction failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    }
  };

  return (
    <div className="card">
      <h2>Auctions</h2>
      {loading && <p className="muted">Loading auctions...</p>}
      {loadError && <div className="banner banner-error">{loadError}</div>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No active auctions right now.</p>}
      {status && <p className="status">{status}</p>}

      <div className="grid">
        {items.map((item) => {
          const secondsLeft = item.endTime - now;
          const isExpired = secondsLeft <= 0;
          const hasBids = item.highestBidder !== ethers.ZeroAddress;
          const minNextBid = hasBids ? item.highestBid + 1n : item.startingPrice;
          const isSeller = account && item.seller.toLowerCase() === account.toLowerCase();
          const isHistoryOpen = !!historyOpen[item.auctionId];
          const history = bidHistory[item.auctionId] || [];

          return (
            <div className="nft-card" key={item.auctionId}>
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

              <p className="price">
                {hasBids ? ethers.formatEther(item.highestBid) : ethers.formatEther(item.startingPrice)} ETH
              </p>
              <p className="muted small">
                Starting price: {ethers.formatEther(item.startingPrice)} ETH
              </p>
              <p className="muted small">
                {hasBids
                  ? `Current bid by ${item.highestBidder.slice(0, 6)}...${item.highestBidder.slice(-4)}`
                  : "No bids yet"}
              </p>
              <p className={isExpired ? "status" : "muted small"}>
                {isExpired ? "Auction time is up" : `Time left: ${formatTimeLeft(secondsLeft)}`}
              </p>

              <button className="bid-history-toggle" onClick={() => toggleHistory(item.auctionId)}>
                {isHistoryOpen ? "Hide bid history" : "View bid history"}
              </button>
              {isHistoryOpen && (
                <div className="bid-history-list">
                  {historyLoading[item.auctionId] && <p className="muted small">Loading...</p>}
                  {!historyLoading[item.auctionId] && history.length === 0 && (
                    <p className="muted small">No bids placed yet.</p>
                  )}
                  {history.map((h, i) => (
                    <div className="bid-history-row" key={i}>
                      <span className="bh-addr">
                        {h.bidder.slice(0, 6)}...{h.bidder.slice(-4)}
                      </span>
                      <span className="bh-amt">{ethers.formatEther(h.amount)} ETH</span>
                    </div>
                  ))}
                </div>
              )}

              {!isExpired && !isSeller && (
                <div className="form-row">
                  <input
                    type="number"
                    step="0.0001"
                    placeholder={`Min ${ethers.formatEther(minNextBid)} ETH`}
                    value={bidInputs[item.auctionId] || ""}
                    onChange={(e) => setBidInputs({ ...bidInputs, [item.auctionId]: e.target.value })}
                  />
                  <button className="btn btn-primary" onClick={() => handleBid(item.auctionId, minNextBid)}>
                    Place Bid
                  </button>
                </div>
              )}

              {!isExpired && isSeller && !hasBids && (
                <>
                  <p className="muted small">Your auction — waiting for bids.</p>
                  <button
                    className="btn btn-outline"
                    style={{ marginTop: 8 }}
                    onClick={() => handleCancelAuction(item.auctionId)}
                  >
                    Cancel Auction
                  </button>
                </>
              )}

              {!isExpired && isSeller && hasBids && (
                <p className="muted small">Your auction — a bid has been placed, cannot cancel now.</p>
              )}

              {isExpired && (
                <button className="btn btn-outline" onClick={() => handleEndAuction(item.auctionId)}>
                  {hasBids ? "End Auction & Settle" : "Close Auction (No Bids)"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
