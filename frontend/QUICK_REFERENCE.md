# Morpho Solana Frontend - Quick Reference

## All 26 Instructions Cheat Sheet

### Admin Instructions (9)

```typescript
// 1. Initialize Protocol (One-time)
initialize(owner: Pubkey, fee_recipient: Pubkey)

// 2. Transfer Ownership (Two-step)
transfer_ownership(new_owner: Pubkey)
accept_ownership() // Called by pending_owner

// 3. Set Fee Recipient
set_fee_recipient(new_recipient: Pubkey)

// 4. Protocol Pause Control
set_protocol_paused(paused: bool)

// 5. Market Pause Control
set_market_paused(market_id: [u8; 32], paused: bool)

// 6. Enable LLTV
enable_lltv(lltv: u64) // 0-10000 bps

// 7. Enable IRM
enable_irm(irm: Pubkey)

// 8. Set Market Fee
set_fee(market_id: [u8; 32], fee: u64) // 0-2500 bps max

// 9. Claim Protocol Fees
claim_fees(market_id: [u8; 32])
```

### Market Instructions (1)

```typescript
// 10. Create Market (Permissionless)
create_market(
  collateral_mint: Pubkey,
  loan_mint: Pubkey,
  oracle: Pubkey,
  irm: Pubkey,
  lltv: u64
)
```

### Position Instructions (2)

```typescript
// 11. Create Position (Auto-prepend before first action)
create_position(market_id: [u8; 32])

// 12. Close Position (Returns rent)
close_position(market_id: [u8; 32])
// Constraint: supply_shares == 0 && borrow_shares == 0 && collateral == 0
```

### Supply Instructions (2)

```typescript
// 13. Supply Loan Tokens
supply(
  market_id: [u8; 32],
  assets: u128,
  min_shares: u128 // Slippage protection
)

// 14. Withdraw Loan Tokens
withdraw(
  market_id: [u8; 32],
  assets: u128,    // Specify assets OR shares (not both)
  shares: u128     // One must be 0
)
```

### Borrow Instructions (4)

```typescript
// 15. Supply Collateral
supply_collateral(
  market_id: [u8; 32],
  amount: u128
)

// 16. Withdraw Collateral
withdraw_collateral(
  market_id: [u8; 32],
  amount: u128
)
// Includes health check

// 17. Borrow Loan Tokens
borrow(
  market_id: [u8; 32],
  assets: u128,
  max_shares: u128 // Slippage protection (0 = no limit)
)
// Includes health check

// 18. Repay Borrowed Tokens
repay(
  market_id: [u8; 32],
  assets: u128,    // Specify assets OR shares (not both)
  shares: u128     // One must be 0
)
```

### Liquidation Instructions (1)

```typescript
// 19. Liquidate Unhealthy Position
liquidate(
  market_id: [u8; 32],
  seized_assets: u128 // Loan tokens to repay
)
// Liquidator receives collateral + LIF bonus
```

### Flash Loan Instructions (3)

```typescript
// 20. Flash Loan Start (Two-step mode)
flash_loan_start(
  market_id: [u8; 32],
  amount: u128
)
// Sets flash_loan_lock = 1

// 21. Flash Loan End (Two-step mode)
flash_loan_end(
  market_id: [u8; 32],
  borrowed_amount: u128
)
// Validates repayment, sets flash_loan_lock = 0

// 22. Flash Loan (Single-instruction)
flash_loan(
  market_id: [u8; 32],
  amount: u128
)
// Repayment validated automatically via vault reload
```

### Utility Instructions (4)

```typescript
// 23. Accrue Interest (Public)
accrue_interest_ix(market_id: [u8; 32])
// Auto-called before operations

// 24. Set Authorization
set_authorization(
  is_authorized: bool,
  expires_at: i64 // Unix timestamp
)

// 25. Revoke Authorization
revoke_authorization()
// Sets is_revoked = true (cannot re-enable)

// 26. Claim Fees
claim_fees(market_id: [u8; 32])
// Transfers pending_fee_shares to fee_recipient position
```

## Admin Access Control

**CRITICAL: All admin routes must verify wallet = protocol owner**

```typescript
// Check if connected wallet is protocol owner
const isAdmin = publicKey.equals(protocolOwner);

// Route protection
if (!isAdmin) {
  return <AccessDenied />;
}
```

**Admin Routes:**
- `/admin` - Dashboard
- `/admin/protocol` - Protocol settings
- `/admin/markets` - Market management
- `/admin/whitelist` - LLTV/IRM whitelist

**Layout Wrapper:**
```typescript
// app/(admin)/admin/layout.tsx
export default function AdminLayout({ children }) {
  const isAdmin = useIsAdmin();
  
  if (!isAdmin) {
    return <AccessDenied owner={protocolOwner} />;
  }
  
  return children;
}
```

**Header Conditional:**
```typescript
// Only show admin link if user is owner
{isAdmin && (
  <Link href="/admin">
    <Shield /> Admin
  </Link>
)}
```

## PDA Derivation

```typescript
// Protocol State
[PROGRAM_SEED, "protocol_state"] → bump

// Market
[PROGRAM_SEED, "market", market_id] → bump

// Position
[PROGRAM_SEED, "position", market_id, owner] → bump

// Authorization
[PROGRAM_SEED, "authorization", authorizer, authorized] → bump

// Collateral Vault
[PROGRAM_SEED, "collateral_vault", market_id] → bump

// Loan Vault
[PROGRAM_SEED, "loan_vault", market_id] → bump
```

## Market ID Calculation

```typescript
import { keccak256 } from 'js-sha3';

function calculateMarketId(
  collateralMint: Pubkey,
  loanMint: Pubkey,
  oracle: Pubkey,
  irm: Pubkey,
  lltv: number
): Buffer {
  const data = Buffer.concat([
    collateralMint.toBuffer(),
    loanMint.toBuffer(),
    oracle.toBuffer(),
    irm.toBuffer(),
    Buffer.from(new BN(lltv).toArray('le', 8))
  ]);
  
  return Buffer.from(keccak256(data), 'hex');
}
```

## Share Math Functions

```typescript
import BN from 'bn.js';

const VIRTUAL_SHARES = new BN(1_000_000);
const VIRTUAL_ASSETS = new BN(1);

// Supply: assets → shares (round DOWN)
function toSharesDown(assets: BN, totalAssets: BN, totalShares: BN): BN {
  return assets
    .mul(totalShares.add(VIRTUAL_SHARES))
    .div(totalAssets.add(VIRTUAL_ASSETS));
}

// Borrow: assets → shares (round UP)
function toSharesUp(assets: BN, totalAssets: BN, totalShares: BN): BN {
  const numerator = assets.mul(totalShares.add(VIRTUAL_SHARES));
  const denominator = totalAssets.add(VIRTUAL_ASSETS);
  return numerator.add(denominator).sub(new BN(1)).div(denominator);
}

// Withdraw: shares → assets (round DOWN)
function toAssetsDown(shares: BN, totalAssets: BN, totalShares: BN): BN {
  return shares
    .mul(totalAssets.add(VIRTUAL_ASSETS))
    .div(totalShares.add(VIRTUAL_SHARES));
}

// Repay: shares → assets (round UP)
function toAssetsUp(shares: BN, totalAssets: BN, totalShares: BN): BN {
  const numerator = shares.mul(totalAssets.add(VIRTUAL_ASSETS));
  const denominator = totalShares.add(VIRTUAL_SHARES);
  return numerator.add(denominator).sub(new BN(1)).div(denominator);
}
```

## Health Factor Formula

```typescript
function calculateHealthFactor(
  collateral: BN,
  borrowAssets: BN,
  lltv: number, // basis points
  oraclePrice: BN // scaled 1e36
): number {
  if (borrowAssets.isZero()) return Infinity;
  
  // maxBorrow = collateral * price * lltv / 1e36 / 10000
  const maxBorrow = collateral
    .mul(oraclePrice)
    .mul(new BN(lltv))
    .div(new BN(10).pow(new BN(36)))
    .div(new BN(10000));
  
  // HF = maxBorrow / borrowAssets
  return maxBorrow.mul(new BN(1000)).div(borrowAssets).toNumber() / 1000;
}

// Liquidatable if HF < 1.0
function isLiquidatable(healthFactor: number): boolean {
  return healthFactor < 1.0;
}
```

## Liquidation Incentive Factor (LIF)

```typescript
function calculateLIF(lltv: number): number {
  // LIF = min(1.15, 1 / (1 - 0.3 * (1 - lltv/10000)))
  const lltvDecimal = lltv / 10000;
  const baseLIF = 1 / (1 - 0.3 * (1 - lltvDecimal));
  return Math.min(1.15, baseLIF);
}

function calculateSeizedCollateral(
  seizedAssets: BN,
  oraclePrice: BN,
  lif: number
): BN {
  // seized_collateral = seized_assets * LIF * 1e36 / price
  const lifScaled = new BN(Math.floor(lif * 1000));
  
  return seizedAssets
    .mul(lifScaled)
    .mul(new BN(10).pow(new BN(36)))
    .div(oraclePrice)
    .div(new BN(1000));
}
```

## Constants

```typescript
// Program
const PROGRAM_SEED = Buffer.from('morpho');

// Virtual offset (inflation protection)
const VIRTUAL_SHARES = 1_000_000; // 1e6
const VIRTUAL_ASSETS = 1;

// WAD scaling
const WAD = 10 ** 18;

// Basis points
const BPS = 10_000; // 100%

// Fees
const MAX_FEE = 2_500; // 25% max
const FLASH_LOAN_FEE_BPS = 5; // 0.05%

// Oracle price scaling
const ORACLE_PRICE_SCALE = 10 ** 36;

// Max u64
const MAX_U64 = 18_446_744_073_709_551_615n;
```

## Common Account Structures

### Market Account

```typescript
interface Market {
  bump: number;
  market_id: Buffer; // 32 bytes
  collateral_mint: PublicKey;
  loan_mint: PublicKey;
  collateral_decimals: number;
  loan_decimals: number;
  oracle: PublicKey;
  irm: PublicKey;
  lltv: number; // basis points
  paused: boolean;
  fee: number; // basis points
  total_supply_assets: BN;
  total_supply_shares: BN;
  total_borrow_assets: BN;
  total_borrow_shares: BN;
  last_update: BN; // timestamp
  pending_fee_shares: BN;
  collateral_vault_bump: number;
  loan_vault_bump: number;
  flash_loan_lock: number; // 0 or 1
}
```

### Position Account

```typescript
interface Position {
  bump: number;
  market_id: Buffer; // 32 bytes
  owner: PublicKey;
  supply_shares: BN;
  borrow_shares: BN;
  collateral: BN; // raw amount, not shares
}
```

### Protocol State Account

```typescript
interface ProtocolState {
  bump: number;
  owner: PublicKey;
  pending_owner: PublicKey;
  fee_recipient: PublicKey;
  paused: boolean;
  lltv_count: number;
  irm_count: number;
  market_count: number;
  enabled_lltvs: number[]; // array of LLTV basis points
  enabled_irms: PublicKey[]; // array of IRM program IDs
}
```

### Authorization Account

```typescript
interface Authorization {
  bump: number;
  authorizer: PublicKey;
  authorized: PublicKey;
  is_authorized: boolean;
  is_revoked: boolean;
  expires_at: BN; // Unix timestamp
}
```

## Instruction Account Requirements

### Supply
- supplier (signer)
- protocol_state
- market
- position (init_if_needed via create_position)
- on_behalf_of
- supplier_token_account
- loan_vault
- loan_mint
- token_program

### Withdraw
- caller (signer)
- protocol_state
- market
- position
- authorization (optional)
- receiver_token_account
- loan_vault
- loan_mint
- token_program

### Borrow
- caller (signer)
- protocol_state
- market
- position
- authorization (optional)
- oracle
- receiver_token_account
- loan_vault
- loan_mint
- token_program

### Liquidate
- liquidator (signer)
- market
- borrower_position
- borrower (unchecked)
- oracle (unchecked)
- liquidator_loan_account
- liquidator_collateral_account
- loan_vault
- collateral_vault
- loan_mint
- collateral_mint
- token_program

## Rounding Rules (CRITICAL)

```
Operation      | Convert        | Rounding | Reason
---------------|----------------|----------|------------------------
Supply         | assets→shares  | DOWN     | User gets fewer shares
Withdraw       | shares→assets  | DOWN     | User gets fewer assets
Borrow         | assets→shares  | UP       | User owes more shares
Repay          | shares→assets  | UP       | User pays more assets
Liquidation    | shares→assets  | UP       | Repaid amount calculation
Fee calculation| shares→assets  | DOWN     | Fee shares minted
```

## Error Codes (Common)

```typescript
enum MorphoError {
  Unauthorized,
  ProtocolPaused,
  MarketPaused,
  ZeroAmount,
  InvalidInput, // Both assets AND shares specified
  SlippageExceeded,
  InsufficientBalance,
  InsufficientLiquidity,
  InsufficientCollateral,
  PositionUnhealthy,
  PositionHealthy, // Liquidation attempt on healthy position
  PositionNotEmpty, // Trying to close non-empty position
  LltvNotEnabled,
  IrmNotEnabled,
  InvalidLltv,
  FeeTooHigh,
  AmountOverflow, // u128 → u64 overflow
  MathOverflow,
  MathUnderflow,
  DivisionByZero,
  FlashLoanInProgress,
  FlashLoanNotRepaid,
  FlashLoanCallbackFailed,
  AuthorizationRevoked,
  AuthorizationExpired,
}
```

## Transaction Flow Examples

### Supply Flow

```
1. Check if position exists
   ├─ Yes → Skip
   └─ No → Prepend create_position()

2. Calculate min_shares (slippage)
   
3. Build supply instruction
   - Transfer tokens from user → vault
   - Mint shares to position

4. Send transaction

5. Confirm & update UI
```

### Borrow Flow

```
1. Check authorization (if delegated)

2. Accrue interest on market

3. Calculate max_shares (slippage)

4. Build borrow instruction
   - Check collateral > 0
   - Transfer tokens from vault → user
   - Mint borrow shares to position
   - Validate health factor > 1.0

5. Send transaction

6. Confirm & update UI with new health factor
```

### Liquidation Flow

```
1. Scan all positions for HF < 1.0

2. For each unhealthy position:
   - Calculate LIF based on LLTV
   - Calculate seized collateral
   - Calculate profit

3. Sort by profit

4. Build liquidate instruction
   - Transfer loan tokens from liquidator → vault
   - Transfer collateral from vault → liquidator
   - Burn borrow shares
   - If collateral depleted: socialize bad debt

5. Send transaction

6. Confirm & celebrate profit
```

## UI States

### Health Factor Colors

```typescript
HF > 1.5  → Green   (Safe)
HF 1.2-1.5 → Yellow  (Caution)
HF 1.05-1.2 → Orange (Warning)
HF < 1.05  → Red     (Critical)
HF < 1.0   → Red     (Liquidatable)
```

### Transaction States

```typescript
'idle'       → Initial state
'building'   → Constructing transaction
'signing'    → Waiting for wallet approval
'sending'    → Broadcasting to network
'confirming' → Waiting for confirmation
'success'    → Transaction confirmed
'error'      → Transaction failed
```

## Tips & Tricks

1. **Always use BN for calculations** - Never JavaScript numbers
2. **Check position existence before operations** - Auto-prepend create_position
3. **Include slippage protection** - min_shares for supply, max_shares for borrow
4. **Validate health factor** - Show warning if HF < 1.2 after action
5. **Use WebSocket subscriptions** - Real-time position updates
6. **Batch RPC calls** - getMultipleAccountsInfo for multiple positions
7. **Cache market data** - Longer stale times for static data
8. **Handle authorization expiry** - Check timestamp before delegated ops
9. **Flash loan lock awareness** - Warn users about market lock
10. **Test on devnet first** - Always test with devnet tokens

## Quick Commands

```bash
# Build
npm run build

# Development
npm run dev

# Test
npm run test

# Lint
npm run lint

# Deploy
vercel --prod
```

---

For full implementation details, see [SKILL.md](./SKILL.md)
