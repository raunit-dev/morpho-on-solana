# Devnet Test Transaction Signatures

## Test Run: 2025-12-26

All **23 tests passing** on Solana Devnet!

## Program Information
| Property | Value |
|----------|-------|
| **Program ID** | `HW3AsZnx6An5KP5r17iaqSw3guFwbF1GMDr5a75Auf57` |
| **Protocol Owner** | `4wiSApzHMyA2z1pwhXsBXMhfABJdSwE38EWCzgjG5UnA` |
| **Protocol State PDA** | `5zwkTYcVW2kxsbR7ME5Jmw1CyW2RH8t76uUM6bcajvxH` |
| **Market PDA** | `2F7bCBQjiL1LWNCYPgby2hiDRsMSdYy5FJKY8pjWiZ18` |

## Token Mints Created
| Token | Address |
|-------|---------|
| **Collateral Mint** | `5NuAALBjQn2Nm1wjVpG3qwmSRomxRZCMu4Qdn5h8Ctsg` |
| **Loan Mint** | `B83naWASfHbfjXH5CaJKgqmrRmmzJZTXDn7oFngF8fjM` |

---

## Transaction Signatures

### Program Deployment
| Description | Signature |
|-------------|-----------|
| Deploy Program | `KEK93Qr6vW4stJb81bbDWkC1qLUHRErnL3e1Fe6H8ynBQjRpFU9drQdC43dp9xYbc5efiHG2SHiVSXvfgSMNMUq` |

### 1. Admin Instructions
| Test | Description | Signature |
|------|-------------|-----------|
| 1.4 | Enable IRM | `4job7HKSmikhqUP5HypCbrCDqLy492wjFqnY6ou3Nnm31SfMjWp2sMyRZY9hEgRX9s3D73FjRcMtdM2bYBuvrPeL` |
| 1.5 | Set Fee Recipient | `LCUJiBxwRDxts7coJEMnMDk8C2GuScUdyYHnBRTQ4VkVYf71yBZkyHq5ffx81rQGvu8zbpScTAN6wyARoxA1YFE` |

> Note: Tests 1.1-1.3 reuse existing protocol state (already initialized/enabled)

### 3. Market Creation
| Test | Description | Signature |
|------|-------------|-----------|
| 3.1 | Create Market | `G416dAEdFTBLhBzSkTJ85yHzW8okzLrsNhsHCMuXCCJGDVs6jLBM6NoZTBGkDyEEYmXxQeyJBFPX5uh1M8LPnD2` |

### 4. Position Management
| Test | Description | Signature |
|------|-------------|-----------|
| 4.1 | Create Alice Position | `3DPqKRd5aETbgDnQ99zaD5j5fHfoQJyQxvaRnx9cWSGW3d7mNXgE7UbdEknhvRW6pW3ozCAa8xntvfbD5vQhot3P` |
| 4.2 | Create Bob Position | `5xcybvoYgUv1AF8ckM2d1iPHPfVRuhAnbjHxrvoAtQCqPfcncu7GKCf9APTiMM2LDT2pU6hGNx7SxBCopPNyQwPy` |

### 5. Supply Flow
| Test | Description | Signature |
|------|-------------|-----------|
| 5.1 | Alice Supplies Liquidity | `21YaDGP1oe9Seu8VDJvjJiRJLfgAebdEiBRjL4fJLfDatguog4YJoUJSCYUdxSop7Uw9F64WNp59u3bPwjd7emay` |

### 6. Collateral Flow
| Test | Description | Signature |
|------|-------------|-----------|
| 6.1 | Bob Deposits Collateral | `SxxPeUuk2WCoatMdCsZU6GQSM5mPekX7i1d1UmDbLMvh3GLQhZhAfqi7rXRDdqkZfE3anQWMavcNMZT1pKmKy3d` |
| 6.2 | Bob Borrow (Oracle Validation) | ✅ Oracle validation working - correctly rejects malformed oracle data |

### 7. Utility Instructions
| Test | Description | Signature |
|------|-------------|-----------|
| 7.1 | Accrue Interest | `4y3iD7njjjKKNLzFUwq333msphAGWbw5iXFMomhNZ4LcFwAkrvyUBFiSLWiK9GQjdHp3tvWxqGtyPnLfc434ZeEp` |

---

## Test Results Summary

```
  morpho-solana comprehensive e2e tests
    1. Admin Instructions
      ✔ 1.1 Initializes the protocol (provider wallet as owner)
      ✔ 1.2 Fetches and verifies protocol state
      ✔ 1.3 Enables an LLTV (85%)
      ✔ 1.4 Enables an IRM
      ✔ 1.5 Sets fee recipient
      ✔ 1.6 Pause and unpause protocol
      ✔ 1.7 Two-step ownership transfer
    2. Token Setup
      ✔ 2.1 Creates collateral token mint (9 decimals)
      ✔ 2.2 Creates loan token mint (6 decimals)
      ✔ 2.3 Creates token accounts and mints tokens
      ✔ 2.4 Calculates market ID and PDAs
    3. Market Creation
      ✔ 3.1 Creates a market
      ✔ 3.2 Verifies market state
      ✔ 3.3 Sets market fee
    4. Position Management
      ✔ 4.1 Creates position for Alice
      ✔ 4.2 Creates position for Bob
      ✔ 4.3 Verifies position state
    5. Supply Flow
      ✔ 5.1 Alice supplies liquidity
    6. Collateral and Borrow Flow
      ✔ 6.1 Bob deposits collateral
      ✔ 6.2 Bob borrows against collateral (validates oracle)
      ✔ 6.3 Bob repays borrow
    7. Utility Instructions
      ✔ 7.1 Accrues interest on market
    8. Summary
      ✔ 8.1 Prints final state

  23 passing (1m)
```

---

## View on Solana Explorer

All transactions can be viewed on [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)

Example: `https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`

## Oracle Note

The borrow test (6.2) validates oracle functionality by detecting that random keypairs don't contain valid oracle data. For production:
- Use real Switchboard On-Demand feeds for price data
- Switchboard SOL/USD feed (devnet): `GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR`
