import React, { useState, useCallback, useEffect, useRef } from "react";
import { ethers } from "ethers";
import ConnectWallet from "./components/ConnectWallet";
import MintNFT from "./components/MintNFT";
import MyNFTs from "./components/MyNFTs";
import NFTList from "./components/NFTList";
import AuctionList from "./components/AuctionList";
import {
  NFT_CONTRACT_ADDRESS,
  NFT_ABI,
  MARKETPLACE_ADDRESS,
  MARKETPLACE_ABI,
  AUCTION_ADDRESS,
  AUCTION_ABI,
} from "./contract/config";
import "./App.css";

const NAV_ITEMS = [
  {
    key: "marketplace",
    label: "Marketplace",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: "auctions",
    label: "Auctions",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" />
      </svg>
    ),
  },
  {
    key: "mint",
    label: "Mint",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
      </svg>
    ),
  },
  {
    key: "my-nfts",
    label: "My NFTs",
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
];

const TAB_TITLES = {
  marketplace: "Marketplace",
  auctions: "Live auctions",
  mint: "Mint a new NFT",
  "my-nfts": "My NFTs",
};

function App() {
  const [account, setAccount] = useState(null);
  const [nftContract, setNftContract] = useState(null);
  const [marketplace, setMarketplace] = useState(null);
  const [auction, setAuction] = useState(null);
  const [tab, setTab] = useState("marketplace");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  const setupForAddress = useCallback(async (address) => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner(address);

    const nft = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
    const market = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    const auctionHouse = new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, signer);

    setAccount(address);
    setNftContract(nft);
    setMarketplace(market);
    setAuction(auctionHouse);
  }, []);

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  const connectWallet = useCallback(async () => {
    setError("");
    if (!window.ethereum) {
      setError("MetaMask (or another injected wallet) is not installed.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      await setupForAddress(accounts[0]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to connect wallet.");
    }
  }, [setupForAddress]);

  const disconnectWallet = () => {
    setAccount(null);
    setNftContract(null);
    setMarketplace(null);
    setAuction(null);
  };

  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accs) => {
      if (accs.length === 0) {
        setAccount(null);
        setNftContract(null);
        setMarketplace(null);
        setAuction(null);
      } else if (accountRef.current === null) {
        return;
      } else {
        setupForAddress(accs[0]).catch((err) => {
          console.error(err);
          setError(err.message || "Failed to switch account.");
        });
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [setupForAddress]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">N</div>
          <div className="logo-text">NFT Marketplace</div>
        </div>

        <div className="nav-section-label">Menu</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? "nav-item active" : "nav-item"}
            onClick={() => setTab(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="app-header">
          <h1>{TAB_TITLES[tab]}</h1>
          <ConnectWallet account={account} onConnect={connectWallet} onDisconnect={disconnectWallet} />
        </header>

        {error && <div className="banner banner-error">{error}</div>}

        {(!NFT_CONTRACT_ADDRESS ||
          !MARKETPLACE_ADDRESS ||
          !AUCTION_ADDRESS ||
          AUCTION_ADDRESS.startsWith("PASTE_")) && (
          <div className="banner banner-warning">
            Set your deployed contract addresses in <code>src/contract/config.js</code>.
          </div>
        )}

        <div className="content">
          {tab === "marketplace" && (
            <NFTList
              nftContract={nftContract}
              marketplace={marketplace}
              account={account}
              refreshKey={refreshKey}
              onPurchased={bumpRefresh}
            />
          )}
          {tab === "auctions" && (
            <AuctionList
              nftContract={nftContract}
              auction={auction}
              account={account}
              refreshKey={refreshKey}
              onAuctionUpdated={bumpRefresh}
            />
          )}
          {tab === "mint" && <MintNFT nftContract={nftContract} account={account} onMinted={bumpRefresh} />}
          {tab === "my-nfts" && (
            <MyNFTs
              nftContract={nftContract}
              marketplace={marketplace}
              auction={auction}
              account={account}
              refreshKey={refreshKey}
              onListed={bumpRefresh}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
