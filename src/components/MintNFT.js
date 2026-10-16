import React, { useState } from "react";
import { useToast } from "../context/ToastContext";

// 👇 Add/edit your ready-to-mint image links here — this is the list of
// "quick pick" thumbnails shown below the input on the Mint tab.
const SAMPLE_IMAGES = [
  {
    label: "VR Ape",
    uri: "https://bafybeibjgcx2jvdwh6tjn764jgoqfepcf5ppgzsmwpkdej6w5zwcz63uja.ipfs.dweb.link?filename=360_F_561154200_Y6TJrRCvdNBxisjnSzrlX9Is6ilAz6dk.jpg",
  },
  {
    label: "Ape NFT",
    uri: "https://bafybeid4ivk5uycgd2huwcxdbvtr63tbsi4wb3e2fajshuuujweu3edpt4.ipfs.dweb.link?filename=ape-nft_551707-123219.avif",
  },
  {
    label: "Cat NFT",
    uri: "https://bafybeigk3si7lupgptwffhgl7z4xn2bpoaf32l7amcissqkk5konnlf3wy.ipfs.dweb.link?filename=ebe427f8f29df29c005b04c398dd8b29.jpg",
  },
];

export default function MintNFT({ nftContract, account, onMinted }) {
  const [tokenURI, setTokenURI] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const { notify, update } = useToast();

  const handleMint = async (e) => {
    e.preventDefault();
    if (!nftContract || !account) {
      setStatus("Connect your wallet first.");
      return;
    }
    if (!tokenURI.trim()) {
      setStatus("Enter a metadata URI (e.g. ipfs://... or https://... JSON link).");
      return;
    }

    const toastId = notify({ type: "pending", message: "Confirm minting in your wallet..." });
    try {
      setLoading(true);
      setStatus("Confirm the transaction in your wallet...");
      const tx = await nftContract.mintNFT(account, tokenURI.trim());
      setStatus("Minting in progress...");
      update(toastId, { type: "pending", message: "Transaction submitted — waiting for confirmation..." });
      await tx.wait();
      setStatus("NFT minted successfully.");
      update(toastId, { type: "success", message: "NFT minted successfully!" });
      setTokenURI("");
      if (onMinted) onMinted();
    } catch (err) {
      console.error(err);
      const message = err.reason || err.message || "Mint failed.";
      setStatus(message);
      update(toastId, { type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Mint a new NFT</h2>
      <p className="muted">
        Enter a metadata URI (JSON containing name, description, image). You can host it on
        IPFS (e.g. via Pinata/NFT.Storage) or any public URL for testing.
      </p>
      <form onSubmit={handleMint} className="form-row">
        <input
          type="text"
          placeholder="ipfs://... or https://.../metadata.json"
          value={tokenURI}
          onChange={(e) => setTokenURI(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Minting..." : "Mint NFT"}
        </button>
      </form>

      <p className="muted small" style={{ marginTop: 16 }}>
        Or pick one of your uploaded images:
      </p>
      <div className="sample-grid">
        {SAMPLE_IMAGES.map((sample) => (
          <button
            key={sample.uri}
            type="button"
            className={tokenURI === sample.uri ? "sample-thumb sample-thumb-active" : "sample-thumb"}
            onClick={() => setTokenURI(sample.uri)}
          >
            <img src={sample.uri} alt={sample.label} />
            <span>{sample.label}</span>
          </button>
        ))}
      </div>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
