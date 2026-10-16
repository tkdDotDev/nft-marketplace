import React from "react";

export default function ConnectWallet({ account, onConnect, onDisconnect }) {
  return (
    <div className="wallet-bar">
      {account ? (
        <>
          <span className="wallet-address">
            {account.slice(0, 6)}...{account.slice(-4)}
          </span>
          <button className="btn btn-outline" onClick={onDisconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <button className="btn btn-primary" onClick={onConnect}>
          Connect Wallet
        </button>
      )}
    </div>
  );
}
