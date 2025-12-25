# Morpho Blue Solana - Frontend Specification

> **Framework**: Next.js 14 with shadcn/ui  
> **Theme**: Light/White (Reference: [FuseWallet](https://fusewallet.com/))  
> **UI Reference**: [Kamino Lend](https://kamino.com/lend)  
> **Protocol**: Morpho Blue isolated lending markets on Solana

---

## Design System

### Color Palette (FuseWallet White Theme)
```css
--background: #FFFFFF
--foreground: #1A1A2E
--card: #F8F9FA
--card-foreground: #1A1A2E
--primary: #6366F1           /* Indigo accent */
--primary-foreground: #FFFFFF
--secondary: #F1F5F9
--secondary-foreground: #475569
--accent: #10B981            /* Success/positive green */
--accent-destructive: #EF4444 /* Error/negative red */
--muted: #94A3B8
--border: #E2E8F0
```

### Typography
```css
--font-sans: 'Inter', sans-serif
--font-mono: 'JetBrains Mono', monospace
```

### shadcn/ui Components to Use
- `Button`, `Card`, `Input`, `Badge`, `Tabs`, `Table`
- `Dialog`, `Sheet`, `Popover`, `Tooltip`
- `Progress`, `Slider`, `Switch`
- `DropdownMenu`, `Select`, `Command`
- `Skeleton` for loading states

---

## Page Structure

### Navigation Bar
| Element | Description |
|---------|-------------|
| Logo | Morpho Blue logo (left) |
| Markets | Browse all lending markets |
| Lend | Supply assets to earn yield |
| Borrow | Borrow against collateral |
| Portfolio | User's positions overview |
| Connect Wallet | Phantom/Solflare/etc (right) |

---

## Pages & User Flows

### 1. Markets Overview (`/markets`)

**Purpose**: Display all available lending markets

**Data Display**:
| Column | Source |
|--------|--------|
| Market | `collateral_mint` / `loan_mint` pair |
| Total Supply | `total_supply_assets` |
| Total Borrow | `total_borrow_assets` |
| Utilization | `utilization()` as percentage |
| Supply APY | Calculated from IRM |
| Borrow APY | From `irm.borrow_rate()` |
| LLTV | `lltv` / 100 as percentage |

**User Actions**:
- Click market row → Navigate to market detail
- Filter by token (SOL, USDC, etc.)
- Sort by APY, Utilization, TVL

**Components**:
```tsx
<Card>
  <Table>
    <TableHeader>Market | Supply | Borrow | Util | APY | LLTV</TableHeader>
    <TableBody>
      {markets.map(m => <MarketRow key={m.id} market={m} />)}
    </TableBody>
  </Table>
</Card>
```

---

### 2. Lend Page (`/lend`)

**Purpose**: Supply assets to earn yield

**Featured Markets Section** (top cards like Kamino):
- 3 highlighted markets with highest APY
- Show: Token icon, APY %, TVL

**Markets Table**:
| Column | Description |
|--------|-------------|
| Vault | Market name with icons |
| APY | Supply APY with trend arrow |
| Deposits | `total_supply_assets` |
| Vault Profile | Risk indicator (Balanced/Conservative) |
| Collateral | Accepted collateral tokens |
| Action | "Deposit" button |

**User Actions**:
1. **Supply Assets**
   - Click "Deposit" → Opens deposit modal
   - Enter amount
   - Review shares to receive
   - Confirm transaction
   
2. **Withdraw Assets**
   - From Portfolio → Select position
   - Enter amount or "Max"
   - Confirm withdrawal

**Instructions Used**:
- `supply(market_id, assets, min_shares)`
- `withdraw(market_id, assets, shares)`

---

### 3. Borrow Page (`/borrow`)

**Purpose**: Borrow assets against collateral

**Markets Grid**:
| Column | Description |
|--------|-------------|
| Asset | Loan token with icon |
| Total Supply | Available to borrow |
| Total Borrow | Currently borrowed |
| Liq. LTV | `lltv` percentage |
| Supply APY | Lender yield |
| Borrow APY | Borrower cost |
| Actions | Supply / Borrow buttons |

**Borrow Flow**:
1. Select market
2. Supply collateral (if needed)
3. Enter borrow amount
4. Review LTV and liquidation price
5. Confirm borrow

**Position Health Indicator**:
```tsx
<Progress 
  value={currentLTV / lltv * 100} 
  className="bg-green-100"
  indicatorClassName={ltv > 0.8 ? "bg-red-500" : "bg-green-500"}
/>
<span>Health Factor: {healthFactor.toFixed(2)}</span>
```

**Instructions Used**:
- `supply_collateral(market_id, amount)`
- `borrow(market_id, assets, max_shares)`
- `repay(market_id, assets, shares)`
- `withdraw_collateral(market_id, amount)`

---

### 4. Market Detail Page (`/market/[id]`)

**Purpose**: Detailed view of single market

**Tabs**:
- Vault Overview
- My Position

**Vault Overview Section**:
| Stat | Source |
|------|--------|
| Total Supplied | `total_supply_assets` |
| Total Borrowed | `total_borrow_assets` |
| Utilization | `utilization()` |
| Supply APY | Calculated |
| Supply APY (30d Avg) | Historical |

**Charts**:
- Supply APY over time (line chart)
- Utilization over time (area chart)

**My Position Section**:
| Field | Description |
|-------|-------------|
| Supplied | User's supply shares → assets |
| Collateral | User's collateral amount |
| Borrowed | User's borrow shares → assets |
| Current LTV | Borrow / (Collateral × Price) |
| Health Factor | Liq threshold / Current LTV |

**Action Buttons**:
- Deposit / Withdraw (for supply)
- Add Collateral / Remove Collateral
- Borrow / Repay

---

### 5. Portfolio Page (`/portfolio`)

**Purpose**: Overview of all user positions

**Summary Cards**:
| Card | Value |
|------|-------|
| Net Value | Total supplied - borrowed (USD) |
| Fees & Interest | Accumulated earnings |
| Claimable Rewards | Protocol rewards |

**Net Value Chart**: Line chart showing portfolio value over time

**Position Tabs**:
- **Lend (X)**: Supply positions
- **Borrow (X)**: Borrow positions
- Transaction History
- Swap History

**Lend Positions Table**:
| Column | Description |
|--------|-------------|
| Market | Token pair |
| Net Value | Supplied value USD |
| Interest Earned | Profit from lending |
| Net APY | Current yield |
| Action | Expand → Withdraw |

**Borrow Positions Table**:
| Column | Description |
|--------|-------------|
| Market | Token pair |
| Net Value | Position value |
| Collateral | Collateral token & amount |
| Debt | Borrowed amount |
| LTV | Current loan-to-value |
| Interest Earned | Net interest (negative = cost) |
| Net APY | Current borrow cost |
| Action | Expand → Repay/Add Collateral |

---

## Modal Components

### Supply Modal
```tsx
<Dialog>
  <DialogHeader>Supply {token.symbol}</DialogHeader>
  <DialogContent>
    <div>Available: {balance} {token.symbol}</div>
    <Input 
      type="number" 
      placeholder="0.00"
      rightElement={<Button variant="ghost">MAX</Button>}
    />
    <div className="flex justify-between">
      <span>You will receive</span>
      <span>{sharesToReceive} shares</span>
    </div>
    <Button className="w-full">Supply {token.symbol}</Button>
  </DialogContent>
</Dialog>
```

### Borrow Modal
```tsx
<Dialog>
  <DialogHeader>Borrow {token.symbol}</DialogHeader>
  <DialogContent>
    <div>Your Collateral: {collateral} {collateralToken}</div>
    <div>Max Borrow: {maxBorrow} {token.symbol}</div>
    <Input 
      type="number" 
      placeholder="0.00"
    />
    <Slider 
      value={[ltv]} 
      max={lltv} 
      step={1}
      onValueChange={setLtv}
    />
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <div>New LTV</div>
        <div className="text-xl">{newLtv}%</div>
      </Card>
      <Card>
        <div>Liquidation Price</div>
        <div className="text-xl">${liqPrice}</div>
      </Card>
    </div>
    <Button className="w-full">Borrow</Button>
  </DialogContent>
</Dialog>
```

### Repay Modal
```tsx
<Dialog>
  <DialogHeader>Repay {token.symbol}</DialogHeader>
  <DialogContent>
    <div>Outstanding Debt: {debt} {token.symbol}</div>
    <Input 
      type="number" 
      rightElement={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">Half</Button>
          <Button variant="ghost" size="sm">Max</Button>
        </div>
      }
    />
    <div className="flex justify-between">
      <span>New LTV after repay</span>
      <span>{newLtv}%</span>
    </div>
    <Button className="w-full">Repay</Button>
  </DialogContent>
</Dialog>
```

---

## Protocol Instructions Reference

### For Wallet Integration

| Action | Instruction | Parameters |
|--------|-------------|------------|
| Supply Assets | `supply` | `market_id`, `assets`, `min_shares` |
| Withdraw Assets | `withdraw` | `market_id`, `assets`, `shares` |
| Add Collateral | `supply_collateral` | `market_id`, `amount` |
| Remove Collateral | `withdraw_collateral` | `market_id`, `amount` |
| Borrow | `borrow` | `market_id`, `assets`, `max_shares` |
| Repay | `repay` | `market_id`, `assets`, `shares` |
| Create Position | `create_position` | `market_id` |
| Close Position | `close_position` | `market_id` |
| Liquidate | `liquidate` | `market_id`, `seized_assets` |
| Flash Loan | `flash_loan_start` + `flash_loan_end` | `market_id`, `amount` |
| Claim Fees | `claim_fees` | `market_id` |

---

## Data Fetching

### Account Types to Fetch
```typescript
interface Market {
  marketId: Uint8Array;
  collateralMint: PublicKey;
  loanMint: PublicKey;
  oracle: PublicKey;
  irm: PublicKey;
  lltv: bigint;              // basis points (e.g., 8500 = 85%)
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  fee: bigint;
  lastUpdate: bigint;
}

interface Position {
  marketId: Uint8Array;
  owner: PublicKey;
  supplyShares: bigint;
  borrowShares: bigint;
  collateral: bigint;
}

interface ProtocolState {
  owner: PublicKey;
  feeRecipient: PublicKey;
  paused: boolean;
  enabledLltvs: bigint[];
  enabledIrms: PublicKey[];
}
```

### Price Fetching (Switchboard)
```typescript
// Fetch from Switchboard oracle
const price = await switchboard.getPullFeedPrice(market.oracle);
```

### APY Calculations
```typescript
// Supply APY = Borrow APY × Utilization × (1 - Fee)
const utilization = market.totalBorrowAssets / market.totalSupplyAssets;
const borrowRate = await irm.getBorrowRate(utilization);
const supplyAPY = borrowRate * utilization * (1 - market.fee / 10000);
const borrowAPY = borrowRate;
```

---

## Transaction Flow

### Example: Supply Flow
```typescript
// 1. Create position if doesn't exist
if (!userPosition) {
  await program.methods
    .createPosition(marketId)
    .accounts({...})
    .rpc();
}

// 2. Approve token transfer
await approveTokenTransfer(loanMint, amount, loanVault);

// 3. Supply assets
await program.methods
  .supply(marketId, amount, minShares)
  .accounts({
    market: marketPda,
    position: positionPda,
    loanVault: loanVaultPda,
    userTokenAccount: userAta,
    ...
  })
  .rpc();
```

---

## Responsive Design

### Breakpoints
```css
sm: 640px    /* Mobile */
md: 768px    /* Tablet */
lg: 1024px   /* Desktop */
xl: 1280px   /* Wide */
```

### Mobile Adaptations
- Collapsible navigation sidebar
- Stacked cards instead of tables
- Bottom sheet modals
- Swipe gestures for tabs

---

## Loading States

Use shadcn `Skeleton` for:
- Market data loading
- Position data loading
- Transaction pending

```tsx
<Card>
  <Skeleton className="h-4 w-[250px]" />
  <Skeleton className="h-8 w-[100px]" />
</Card>
```

---

## Error Handling

### Error Types
| Code | Message | UI Action |
|------|---------|-----------|
| `InsufficientBalance` | Not enough tokens | Show balance, disable button |
| `ExceedsMaxLTV` | Would exceed LTV limit | Show warning, block tx |
| `MarketPaused` | Market is paused | Show banner, disable actions |
| `SlippageExceeded` | Price moved | Retry with higher slippage |
| `Unauthorized` | Not position owner | Show error toast |

---

## Notifications

Use `sonner` toast for:
- Transaction submitted (pending)
- Transaction confirmed (success)
- Transaction failed (error)
- Wallet connected/disconnected

```tsx
import { toast } from "sonner";

toast.success("Supply successful!", {
  description: `Supplied ${amount} ${token.symbol}`,
  action: {
    label: "View TX",
    onClick: () => window.open(explorerUrl),
  },
});
```
