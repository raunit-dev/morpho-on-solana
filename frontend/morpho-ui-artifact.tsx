import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Shield, 
  Zap, 
  AlertTriangle, 
  CheckCircle,
  Settings,
  Lock,
  Unlock,
  DollarSign,
  BarChart3,
  User,
  Users,
  Clock,
  X
} from 'lucide-react';

/*
 * MORPHO BLUE SOLANA - LENDING PROTOCOL UI
 * 
 * This artifact demonstrates all 26 instructions with proper admin access control.
 * 
 * BY DEFAULT: You are logged in as a REGULAR USER (non-admin)
 * - You can access: Markets, Dashboard, Liquidations
 * - You CANNOT access: Admin Panel (owner only)
 * 
 * TO TEST AS ADMIN:
 * 1. Find the line: const MOCK_WALLET_ADDRESS = '0x9b2c...8f4d';
 * 2. Change it to:   const MOCK_WALLET_ADDRESS = '0x7a3f...2e1c';
 * 3. This matches the protocol owner, giving you admin access
 * 4. You'll see the "Owner" badge and "Admin" button appear
 * 
 * This simulates real-world behavior where only the protocol owner
 * (verified on-chain) can access administrative functions.
 */

// ============================================================================
// Mock Data & Types
// ============================================================================

// Mock wallet - Set to NON-ADMIN by default
// To test admin features, change MOCK_WALLET_ADDRESS to match MOCK_PROTOCOL_OWNER
const MOCK_WALLET_ADDRESS = '0x9b2c...8f4d'; // Regular user (non-admin)
const MOCK_PROTOCOL_OWNER = '0x7a3f...2e1c'; // Protocol owner address

// To test as admin, uncomment this line:
// const MOCK_WALLET_ADDRESS = '0x7a3f...2e1c'; // Admin wallet

interface Market {
  id: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralMint: string;
  loanMint: string;
  supplyAPY: number;
  borrowAPY: number;
  totalSupply: number;
  totalBorrow: number;
  lltv: number;
  availableLiquidity: number;
  utilization: number;
  paused: boolean;
}

interface Position {
  marketId: string;
  supplyShares: number;
  supplyAssets: number;
  borrowShares: number;
  borrowAssets: number;
  collateral: number;
  healthFactor: number;
}

interface LiquidationOpportunity {
  borrower: string;
  marketId: string;
  collateral: number;
  debt: number;
  healthFactor: number;
  profit: number;
  lif: number;
}

interface Authorization {
  authorized: string;
  isAuthorized: boolean;
  isRevoked: boolean;
  expiresAt: number;
  createdAt: number;
}

// Mock Markets
const MOCK_MARKETS: Market[] = [
  {
    id: '1',
    collateralSymbol: 'SOL',
    loanSymbol: 'USDC',
    collateralMint: '0x123...',
    loanMint: '0x456...',
    supplyAPY: 4.2,
    borrowAPY: 8.5,
    totalSupply: 12400000,
    totalBorrow: 8200000,
    lltv: 8000, // 80%
    availableLiquidity: 4200000,
    utilization: 66.1,
    paused: false,
  },
  {
    id: '2',
    collateralSymbol: 'mSOL',
    loanSymbol: 'USDC',
    collateralMint: '0x789...',
    loanMint: '0x456...',
    supplyAPY: 5.1,
    borrowAPY: 9.2,
    totalSupply: 8500000,
    totalBorrow: 6100000,
    lltv: 8600, // 86%
    availableLiquidity: 2400000,
    utilization: 71.8,
    paused: false,
  },
  {
    id: '3',
    collateralSymbol: 'jitoSOL',
    loanSymbol: 'USDT',
    collateralMint: '0xabc...',
    loanMint: '0xdef...',
    supplyAPY: 6.8,
    borrowAPY: 11.5,
    totalSupply: 5200000,
    totalBorrow: 4100000,
    lltv: 7000, // 70%
    availableLiquidity: 1100000,
    utilization: 78.8,
    paused: false,
  },
];

// Mock Position
const MOCK_POSITION: Position = {
  marketId: '1',
  supplyShares: 1250000000000,
  supplyAssets: 1250,
  borrowShares: 500000000000,
  borrowAssets: 75,
  collateral: 1.2,
  healthFactor: 2.45,
};

// Mock Liquidations
const MOCK_LIQUIDATIONS: LiquidationOpportunity[] = [
  {
    borrower: '0x7a3f...2e1c',
    marketId: '1',
    collateral: 5.2,
    debt: 850,
    healthFactor: 0.92,
    profit: 95,
    lif: 1.12,
  },
  {
    borrower: '0x9b2c...8f4d',
    marketId: '2',
    collateral: 12.5,
    debt: 2100,
    healthFactor: 0.88,
    profit: 220,
    lif: 1.15,
  },
];

// Mock Authorizations
const MOCK_AUTHORIZATIONS: Authorization[] = [
  {
    authorized: '0x7a3f...2e1c',
    isAuthorized: true,
    isRevoked: false,
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  {
    authorized: '0x2b9c...5a7e',
    isAuthorized: false,
    isRevoked: true,
    expiresAt: 0,
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

const isAdmin = (walletAddress: string, protocolOwner: string): boolean => {
  return walletAddress === protocolOwner;
};

const formatNumber = (num: number, decimals: number = 2): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(decimals)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(decimals)}K`;
  }
  return num.toFixed(decimals);
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getHealthColor = (hf: number): string => {
  if (hf > 1.5) return 'text-green-500';
  if (hf > 1.2) return 'text-yellow-500';
  if (hf > 1.05) return 'text-orange-500';
  return 'text-red-500';
};

const getHealthBgColor = (hf: number): string => {
  if (hf > 1.5) return 'bg-green-500';
  if (hf > 1.2) return 'bg-yellow-500';
  if (hf > 1.05) return 'bg-orange-500';
  return 'bg-red-500';
};

const getHealthLabel = (hf: number): string => {
  if (hf > 1.5) return 'Safe';
  if (hf > 1.2) return 'Caution';
  if (hf > 1.05) return 'Warning';
  return 'Critical';
};

// ============================================================================
// Components
// ============================================================================

// Health Factor Bar Component
const HealthFactorBar: React.FC<{ healthFactor: number }> = ({ healthFactor }) => {
  const percentage = Math.min((healthFactor / 2) * 100, 100);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">Health Factor</span>
        <span className={`font-mono text-lg font-bold ${getHealthColor(healthFactor)}`}>
          {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
        </span>
      </div>
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`absolute h-full ${getHealthBgColor(healthFactor)} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{getHealthLabel(healthFactor)}</span>
        <span>Liquidation at &lt;1.0</span>
      </div>
    </div>
  );
};

// Market Card Component
const MarketCard: React.FC<{ market: Market; onClick: () => void }> = ({ market, onClick }) => {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">
              {market.collateralSymbol} / {market.loanSymbol}
            </CardTitle>
            <CardDescription>LLTV: {(market.lltv / 100).toFixed(0)}%</CardDescription>
          </div>
          {market.paused && (
            <Badge variant="destructive">
              <Lock className="w-3 h-3 mr-1" />
              Paused
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Supply APY</p>
            <p className="text-lg font-bold text-green-600">{market.supplyAPY.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Borrow APY</p>
            <p className="text-lg font-bold text-orange-600">{market.borrowAPY.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Supply</p>
            <p className="text-lg font-semibold">${formatNumber(market.totalSupply)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Borrow</p>
            <p className="text-lg font-semibold">${formatNumber(market.totalBorrow)}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Utilization</span>
            <span>{market.utilization.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${market.utilization}%` }}
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Available: ${formatNumber(market.availableLiquidity)}
        </div>
      </CardContent>
    </Card>
  );
};

// Supply Tab Component
const SupplyTab: React.FC<{ market: Market }> = ({ market }) => {
  const [amount, setAmount] = useState('');
  const [onBehalfOf, setOnBehalfOf] = useState('');
  const [minShares, setMinShares] = useState('');
  
  const handleSupply = () => {
    console.log('Supply:', { amount, onBehalfOf: onBehalfOf || 'self', minShares });
    alert(`Supply ${amount} ${market.loanSymbol} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Instruction: supply()</AlertTitle>
        <AlertDescription>
          Supply loan tokens to earn interest. Shares calculated with DOWN rounding.
        </AlertDescription>
      </Alert>
      
      <div>
        <label className="text-sm font-medium">Amount to Supply</label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Button variant="outline" onClick={() => setAmount('1000')}>MAX</Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Balance: 5,000 {market.loanSymbol}
        </div>
      </div>
      
      <div>
        <label className="text-sm font-medium">On Behalf Of (Optional)</label>
        <Input
          value={onBehalfOf}
          onChange={(e) => setOnBehalfOf(e.target.value)}
          placeholder="Your address (default)"
          className="mt-1"
        />
        <div className="text-xs text-gray-500 mt-1">
          Supply for another address (delegation)
        </div>
      </div>
      
      <div>
        <label className="text-sm font-medium">Min Shares (Slippage Protection)</label>
        <Input
          type="number"
          value={minShares}
          onChange={(e) => setMinShares(e.target.value)}
          placeholder="Auto-calculated"
          className="mt-1"
        />
        <div className="text-xs text-gray-500 mt-1">
          Minimum shares to receive (1% slippage default)
        </div>
      </div>
      
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Expected Shares</span>
              <span className="font-mono">~1,000,000</span>
            </div>
            <div className="flex justify-between">
              <span>Supply APY</span>
              <span className="text-green-600 font-semibold">{market.supplyAPY}%</span>
            </div>
            <div className="flex justify-between">
              <span>Est. Annual Earnings</span>
              <span className="font-semibold">~$42</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Button onClick={handleSupply} className="w-full" disabled={!amount}>
        <DollarSign className="w-4 h-4 mr-2" />
        Supply {market.loanSymbol}
      </Button>
    </div>
  );
};

// Withdraw Tab Component
const WithdrawTab: React.FC<{ market: Market; position: Position }> = ({ market, position }) => {
  const [mode, setMode] = useState<'assets' | 'shares'>('assets');
  const [amount, setAmount] = useState('');
  
  const handleWithdraw = () => {
    console.log('Withdraw:', { mode, amount });
    alert(`Withdraw ${amount} ${mode === 'assets' ? market.loanSymbol : 'shares'} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Instruction: withdraw()</AlertTitle>
        <AlertDescription>
          Withdraw supplied tokens. Specify EITHER assets OR shares (not both).
        </AlertDescription>
      </Alert>
      
      <div className="flex gap-2">
        <Button
          variant={mode === 'assets' ? 'default' : 'outline'}
          onClick={() => setMode('assets')}
          className="flex-1"
        >
          By Amount
        </Button>
        <Button
          variant={mode === 'shares' ? 'default' : 'outline'}
          onClick={() => setMode('shares')}
          className="flex-1"
        >
          By Shares
        </Button>
      </div>
      
      <div>
        <label className="text-sm font-medium">
          {mode === 'assets' ? 'Amount to Withdraw' : 'Shares to Burn'}
        </label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Button 
            variant="outline" 
            onClick={() => setAmount(mode === 'assets' ? position.supplyAssets.toString() : position.supplyShares.toString())}
          >
            MAX
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {mode === 'assets' 
            ? `Your Supply: ${position.supplyAssets} ${market.loanSymbol}` 
            : `Your Shares: ${position.supplyShares.toLocaleString()}`}
        </div>
      </div>
      
      <Card className="bg-orange-50 border-orange-200">
        <CardContent className="pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>You'll Receive</span>
              <span className="font-mono">
                {mode === 'assets' ? `${amount || '0'} ${market.loanSymbol}` : `~${amount || '0'} ${market.loanSymbol}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Available Liquidity</span>
              <span className="font-semibold">${formatNumber(market.availableLiquidity)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Button onClick={handleWithdraw} className="w-full" variant="outline" disabled={!amount}>
        <TrendingDown className="w-4 h-4 mr-2" />
        Withdraw {mode === 'assets' ? market.loanSymbol : 'Shares'}
      </Button>
    </div>
  );
};

// Collateral Tab Component
const CollateralTab: React.FC<{ market: Market; position: Position }> = ({ market, position }) => {
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  
  const handleCollateral = () => {
    console.log('Collateral:', { action, amount });
    alert(`${action === 'deposit' ? 'Supply' : 'Withdraw'} ${amount} ${market.collateralSymbol} collateral - Transaction would be sent here`);
  };
  
  const maxSafeWithdraw = position.collateral * 0.8; // Example: 80% of collateral
  
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>
          Instruction: {action === 'deposit' ? 'supply_collateral()' : 'withdraw_collateral()'}
        </AlertTitle>
        <AlertDescription>
          {action === 'deposit' 
            ? 'Deposit collateral to increase borrow capacity.'
            : 'Withdraw collateral (health check applied).'}
        </AlertDescription>
      </Alert>
      
      <div className="flex gap-2">
        <Button
          variant={action === 'deposit' ? 'default' : 'outline'}
          onClick={() => setAction('deposit')}
          className="flex-1"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Deposit
        </Button>
        <Button
          variant={action === 'withdraw' ? 'default' : 'outline'}
          onClick={() => setAction('withdraw')}
          className="flex-1"
        >
          <TrendingDown className="w-4 h-4 mr-2" />
          Withdraw
        </Button>
      </div>
      
      <div>
        <label className="text-sm font-medium">Amount</label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Button 
            variant="outline" 
            onClick={() => setAmount(action === 'deposit' ? '10' : maxSafeWithdraw.toFixed(2))}
          >
            MAX
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {action === 'deposit'
            ? `Wallet Balance: 10 ${market.collateralSymbol}`
            : `Current Collateral: ${position.collateral} ${market.collateralSymbol}`}
        </div>
      </div>
      
      {action === 'withdraw' && position.borrowAssets > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Health Factor Warning</AlertTitle>
          <AlertDescription>
            Withdrawing collateral will lower your health factor. Max safe withdrawal: {maxSafeWithdraw.toFixed(2)} {market.collateralSymbol}
          </AlertDescription>
        </Alert>
      )}
      
      <Card className={action === 'deposit' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}>
        <CardContent className="pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Current Collateral</span>
              <span className="font-mono">{position.collateral} {market.collateralSymbol}</span>
            </div>
            {action === 'deposit' && (
              <div className="flex justify-between">
                <span>Borrow Capacity Increase</span>
                <span className="font-semibold text-green-600">+${((parseFloat(amount) || 0) * 150).toFixed(0)}</span>
              </div>
            )}
            {action === 'withdraw' && position.borrowAssets > 0 && (
              <div className="flex justify-between">
                <span>New Health Factor</span>
                <span className={`font-semibold ${getHealthColor(2.0)}`}>
                  ~2.0
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Button onClick={handleCollateral} className="w-full" disabled={!amount}>
        <Shield className="w-4 h-4 mr-2" />
        {action === 'deposit' ? 'Deposit' : 'Withdraw'} Collateral
      </Button>
    </div>
  );
};

// Borrow Tab Component
const BorrowTab: React.FC<{ market: Market; position: Position }> = ({ market, position }) => {
  const [amount, setAmount] = useState('');
  const [maxShares, setMaxShares] = useState('');
  
  const maxBorrow = position.collateral * 150 * (market.lltv / 10000); // Example calculation
  const newHealthFactor = position.collateral > 0 
    ? (position.collateral * 150 * (market.lltv / 10000)) / (position.borrowAssets + (parseFloat(amount) || 0))
    : Infinity;
  
  const handleBorrow = () => {
    console.log('Borrow:', { amount, maxShares });
    alert(`Borrow ${amount} ${market.loanSymbol} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Instruction: borrow()</AlertTitle>
        <AlertDescription>
          Borrow against your collateral. Health check applied.
        </AlertDescription>
      </Alert>
      
      {position.collateral === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Collateral</AlertTitle>
          <AlertDescription>
            You must deposit collateral before borrowing. Go to the Collateral tab.
          </AlertDescription>
        </Alert>
      )}
      
      <div>
        <label className="text-sm font-medium">Amount to Borrow</label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={position.collateral === 0}
          />
          <Button 
            variant="outline" 
            onClick={() => setAmount((maxBorrow * 0.8).toFixed(2))}
            disabled={position.collateral === 0}
          >
            MAX
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Max Borrow: ${maxBorrow.toFixed(2)}
        </div>
      </div>
      
      <div>
        <label className="text-sm font-medium">Max Shares (Slippage Protection)</label>
        <Input
          type="number"
          value={maxShares}
          onChange={(e) => setMaxShares(e.target.value)}
          placeholder="Auto-calculated (0 = no limit)"
          className="mt-1"
          disabled={position.collateral === 0}
        />
        <div className="text-xs text-gray-500 mt-1">
          Maximum shares to mint (1% slippage default)
        </div>
      </div>
      
      <Card className={`${newHealthFactor < 1.2 ? 'bg-red-50 border-red-200' : 'bg-purple-50 border-purple-200'}`}>
        <CardContent className="pt-4">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Expected Borrow Shares</span>
              <span className="font-mono">~500,000</span>
            </div>
            <div className="flex justify-between">
              <span>Borrow APY</span>
              <span className="text-orange-600 font-semibold">{market.borrowAPY}%</span>
            </div>
            <div className="flex justify-between">
              <span>Est. Daily Interest</span>
              <span className="font-semibold">~${((parseFloat(amount) || 0) * market.borrowAPY / 100 / 365).toFixed(2)}</span>
            </div>
            <div className="border-t pt-2">
              <HealthFactorBar healthFactor={newHealthFactor} />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {newHealthFactor < 1.2 && newHealthFactor >= 1.0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 h-4" />
          <AlertTitle>Health Factor Warning</AlertTitle>
          <AlertDescription>
            Your health factor will be {newHealthFactor.toFixed(2)}. Consider borrowing less or adding more collateral.
          </AlertDescription>
        </Alert>
      )}
      
      <Button 
        onClick={handleBorrow} 
        className="w-full" 
        disabled={!amount || position.collateral === 0 || newHealthFactor < 1.0}
      >
        <TrendingDown className="w-4 h-4 mr-2" />
        Borrow {market.loanSymbol}
      </Button>
    </div>
  );
};

// Repay Tab Component
const RepayTab: React.FC<{ market: Market; position: Position }> = ({ market, position }) => {
  const [mode, setMode] = useState<'assets' | 'shares'>('assets');
  const [amount, setAmount] = useState('');
  
  const newHealthFactor = position.collateral > 0 
    ? (position.collateral * 150 * (market.lltv / 10000)) / (position.borrowAssets - (parseFloat(amount) || 0))
    : Infinity;
  
  const handleRepay = () => {
    console.log('Repay:', { mode, amount });
    alert(`Repay ${amount} ${mode === 'assets' ? market.loanSymbol : 'shares'} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Instruction: repay()</AlertTitle>
        <AlertDescription>
          Repay borrowed tokens. Specify EITHER assets OR shares (not both).
        </AlertDescription>
      </Alert>
      
      {position.borrowAssets === 0 && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>No Debt</AlertTitle>
          <AlertDescription>
            You don't have any outstanding borrows in this market.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex gap-2">
        <Button
          variant={mode === 'assets' ? 'default' : 'outline'}
          onClick={() => setMode('assets')}
          className="flex-1"
        >
          By Amount
        </Button>
        <Button
          variant={mode === 'shares' ? 'default' : 'outline'}
          onClick={() => setMode('shares')}
          className="flex-1"
        >
          By Shares
        </Button>
      </div>
      
      <div>
        <label className="text-sm font-medium">
          {mode === 'assets' ? 'Amount to Repay' : 'Shares to Burn'}
        </label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={position.borrowAssets === 0}
          />
          <Button 
            variant="outline" 
            onClick={() => setAmount(mode === 'assets' ? position.borrowAssets.toString() : position.borrowShares.toString())}
            disabled={position.borrowAssets === 0}
          >
            MAX
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {mode === 'assets' 
            ? `Outstanding Debt: ${position.borrowAssets} ${market.loanSymbol}` 
            : `Borrow Shares: ${position.borrowShares.toLocaleString()}`}
        </div>
      </div>
      
      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-4">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Shares Burned</span>
              <span className="font-mono">
                {mode === 'shares' ? amount || '0' : '~' + amount}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Remaining Debt</span>
              <span className="font-semibold">
                ${(position.borrowAssets - (parseFloat(amount) || 0)).toFixed(2)}
              </span>
            </div>
            {position.borrowAssets > 0 && (
              <div className="border-t pt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs">Health Factor Improvement</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm ${getHealthColor(position.healthFactor)}`}>
                      {position.healthFactor.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className={`font-mono text-sm ${getHealthColor(newHealthFactor)}`}>
                      {newHealthFactor === Infinity ? '∞' : newHealthFactor.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Button 
        onClick={handleRepay} 
        className="w-full" 
        variant="outline"
        disabled={!amount || position.borrowAssets === 0}
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        Repay {mode === 'assets' ? market.loanSymbol : 'Shares'}
      </Button>
    </div>
  );
};

// Liquidate Tab Component
const LiquidateTab: React.FC<{ market: Market }> = ({ market }) => {
  const opportunities = MOCK_LIQUIDATIONS.filter(liq => liq.marketId === market.id);
  
  const handleLiquidate = (opp: LiquidationOpportunity) => {
    console.log('Liquidate:', opp);
    alert(`Liquidate ${opp.borrower} - Profit: $${opp.profit} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertTitle>Instruction: liquidate()</AlertTitle>
        <AlertDescription>
          Liquidate unhealthy positions and earn liquidation bonus (LIF).
        </AlertDescription>
      </Alert>
      
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Liquidation Opportunities</h3>
        <Badge variant="outline">{opportunities.length} found</Badge>
      </div>
      
      {opportunities.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>No liquidation opportunities in this market.</p>
            <p className="text-sm mt-1">All positions are healthy!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp, idx) => (
            <Card key={idx} className="border-red-200">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-500">Borrower</p>
                      <p className="font-mono text-sm">{opp.borrower}</p>
                    </div>
                    <Badge variant="destructive">
                      HF: {opp.healthFactor.toFixed(2)}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Collateral</p>
                      <p className="font-semibold">{opp.collateral} {market.collateralSymbol}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Debt</p>
                      <p className="font-semibold">${opp.debt}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">LIF Bonus</p>
                      <p className="font-semibold text-green-600">{((opp.lif - 1) * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Est. Profit</p>
                      <p className="font-semibold text-green-600">${opp.profit}</p>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => handleLiquidate(opp)} 
                    className="w-full"
                    variant="destructive"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Liquidate Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Liquidation Mechanics</AlertTitle>
        <AlertDescription className="text-xs space-y-1 mt-2">
          <p>• You repay the borrower's debt with loan tokens</p>
          <p>• You receive their collateral + LIF bonus</p>
          <p>• LIF = Liquidation Incentive Factor (up to 15% bonus)</p>
          <p>• If collateral depleted, bad debt is socialized</p>
        </AlertDescription>
      </Alert>
    </div>
  );
};

// Flash Loan Tab Component
const FlashLoanTab: React.FC<{ market: Market }> = ({ market }) => {
  const [mode, setMode] = useState<'single' | 'twostep'>('single');
  const [amount, setAmount] = useState('');
  
  const fee = (parseFloat(amount) || 0) * 0.0005; // 0.05% fee
  const totalRepayment = (parseFloat(amount) || 0) + fee;
  
  const handleFlashLoan = () => {
    console.log('Flash Loan:', { mode, amount, fee });
    alert(`Flash loan ${amount} ${market.loanSymbol} (fee: ${fee.toFixed(2)}) - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertTitle>Instructions: flash_loan(), flash_loan_start(), flash_loan_end()</AlertTitle>
        <AlertDescription>
          Borrow instantly without collateral, repay in same transaction + 0.05% fee.
        </AlertDescription>
      </Alert>
      
      <div className="flex gap-2">
        <Button
          variant={mode === 'single' ? 'default' : 'outline'}
          onClick={() => setMode('single')}
          className="flex-1"
        >
          Single-Instruction
        </Button>
        <Button
          variant={mode === 'twostep' ? 'default' : 'outline'}
          onClick={() => setMode('twostep')}
          className="flex-1"
        >
          Two-Step (Advanced)
        </Button>
      </div>
      
      <div>
        <label className="text-sm font-medium">Borrow Amount</label>
        <div className="flex gap-2 mt-1">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Button variant="outline" onClick={() => setAmount(market.availableLiquidity.toString())}>
            MAX
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Available Liquidity: ${formatNumber(market.availableLiquidity)}
        </div>
      </div>
      
      <Card className="bg-purple-50 border-purple-200">
        <CardContent className="pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Borrow Amount</span>
              <span className="font-mono">{amount || '0'} {market.loanSymbol}</span>
            </div>
            <div className="flex justify-between">
              <span>Flash Loan Fee (0.05%)</span>
              <span className="font-mono">{fee.toFixed(2)} {market.loanSymbol}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Total Repayment</span>
              <span className="font-mono">{totalRepayment.toFixed(2)} {market.loanSymbol}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {mode === 'single' ? (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Single-Instruction Mode</AlertTitle>
          <AlertDescription className="text-xs space-y-1 mt-2">
            <p>✓ Simplest mode - repayment validated automatically</p>
            <p>✓ Your custom logic runs between borrow/repay</p>
            <p>✓ All happens in one atomic transaction</p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Two-Step Mode (Advanced)</AlertTitle>
          <AlertDescription className="text-xs space-y-1 mt-2">
            <p>1. flash_loan_start() - Borrows & locks market</p>
            <p>2. [Your custom logic]</p>
            <p>3. flash_loan_end() - Validates repayment & unlocks</p>
            <p className="text-red-600 font-semibold">⚠️ Market is LOCKED during flash loan!</p>
          </AlertDescription>
        </Alert>
      )}
      
      <Alert>
        <BarChart3 className="h-4 w-4" />
        <AlertTitle>Use Cases</AlertTitle>
        <AlertDescription className="text-xs space-y-1 mt-2">
          <p>• Arbitrage between DEXs</p>
          <p>• Collateral swaps (refinancing)</p>
          <p>• Liquidations without capital</p>
          <p>• Self-liquidation to avoid penalty</p>
        </AlertDescription>
      </Alert>
      
      <Button onClick={handleFlashLoan} className="w-full" disabled={!amount}>
        <Zap className="w-4 h-4 mr-2" />
        Execute Flash Loan
      </Button>
    </div>
  );
};

// Authorization Tab Component
const AuthorizationTab: React.FC = () => {
  const [newAuth, setNewAuth] = useState('');
  const [expiryDays, setExpiryDays] = useState('365');
  const [neverExpires, setNeverExpires] = useState(false);
  
  const handleGrant = () => {
    console.log('Grant authorization:', { newAuth, expiryDays, neverExpires });
    alert(`Grant authorization to ${newAuth} - Transaction would be sent here`);
  };
  
  const handleRevoke = (auth: Authorization) => {
    console.log('Revoke authorization:', auth);
    alert(`Revoke authorization for ${auth.authorized} - Transaction would be sent here`);
  };
  
  return (
    <div className="space-y-4">
      <Alert>
        <Users className="h-4 w-4" />
        <AlertTitle>Instructions: set_authorization(), revoke_authorization()</AlertTitle>
        <AlertDescription>
          Grant others permission to manage your positions. Time-limited delegations.
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Grant New Authorization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Authorized Address</label>
            <Input
              value={newAuth}
              onChange={(e) => setNewAuth(e.target.value)}
              placeholder="Enter Solana address"
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Expiry</label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={neverExpires}
                  onChange={(e) => setNeverExpires(e.target.checked)}
                  className="rounded"
                />
                Never expires
              </label>
              {!neverExpires && (
                <Input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  placeholder="Days until expiry"
                />
              )}
            </div>
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Permissions Granted</AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-2">
              <p>• Withdraw your supplied tokens</p>
              <p>• Borrow on your behalf</p>
              <p>• Withdraw your collateral</p>
            </AlertDescription>
          </Alert>
          
          <Button onClick={handleGrant} className="w-full" disabled={!newAuth}>
            <User className="w-4 h-4 mr-2" />
            Grant Authorization
          </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Authorizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {MOCK_AUTHORIZATIONS.map((auth, idx) => (
            <div key={idx} className="border rounded-lg p-3">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="text-sm font-mono">{auth.authorized}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {auth.isRevoked ? (
                      <Badge variant="destructive">
                        <X className="w-3 h-3 mr-1" />
                        Revoked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    {!auth.isRevoked && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires: {formatDate(auth.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
                {!auth.isRevoked && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevoke(auth)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Created: {formatDate(auth.createdAt)}
              </p>
              {auth.isRevoked && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Cannot be re-enabled once revoked
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

// Admin Panel Component
const AdminPanel: React.FC = () => {
  const [selectedMarket, setSelectedMarket] = useState(MOCK_MARKETS[0].id);
  const [newLltv, setNewLltv] = useState('');
  const [newIrm, setNewIrm] = useState('');
  const [newFee, setNewFee] = useState('');
  const [protocolPaused, setProtocolPaused] = useState(false);
  
  const market = MOCK_MARKETS.find(m => m.id === selectedMarket);
  
  return (
    <div className="space-y-6">
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertTitle>Admin Instructions (9 total)</AlertTitle>
        <AlertDescription>
          Protocol management, whitelist controls, pause mechanisms, fees.
        </AlertDescription>
      </Alert>
      
      {/* Protocol Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Protocol Settings</CardTitle>
          <CardDescription>Owner: 0x9a2f...1b3c</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Protocol Status</p>
              <p className="text-sm text-gray-500">Pause all operations</p>
            </div>
            <Button
              variant={protocolPaused ? 'destructive' : 'outline'}
              onClick={() => setProtocolPaused(!protocolPaused)}
            >
              {protocolPaused ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              {protocolPaused ? 'Paused' : 'Active'}
            </Button>
          </div>
          
          <div className="border-t pt-4">
            <p className="font-medium mb-2">Ownership Transfer</p>
            <div className="flex gap-2">
              <Input placeholder="New owner address" />
              <Button variant="outline">Transfer</Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Two-step process: propose → new owner accepts
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Whitelist Management */}
      <Card>
        <CardHeader>
          <CardTitle>Whitelist Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium mb-2">Enabled LLTVs</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge>70% (7000 bps)</Badge>
              <Badge>80% (8000 bps)</Badge>
              <Badge>86% (8600 bps)</Badge>
              <Badge>94.5% (9450 bps)</Badge>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                value={newLltv}
                onChange={(e) => setNewLltv(e.target.value)}
                placeholder="LLTV in bps (1-10000)"
              />
              <Button onClick={() => alert(`Enable LLTV ${newLltv} bps`)}>
                Enable
              </Button>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <p className="font-medium mb-2">Enabled IRMs</p>
            <div className="space-y-2 mb-3">
              <p className="text-sm font-mono">0x3f2a... - Adaptive Rate</p>
              <p className="text-sm font-mono">0x7b1c... - Linear Rate</p>
            </div>
            <div className="flex gap-2">
              <Input
                value={newIrm}
                onChange={(e) => setNewIrm(e.target.value)}
                placeholder="IRM program address"
              />
              <Button onClick={() => alert(`Enable IRM ${newIrm}`)}>
                Enable
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Market Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Market Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Select Market</label>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="w-full mt-1 p-2 border rounded"
            >
              {MOCK_MARKETS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.collateralSymbol} / {m.loanSymbol}
                </option>
              ))}
            </select>
          </div>
          
          {market && (
            <>
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="font-medium">Market Status</p>
                  <p className="text-sm text-gray-500">Pause this market only</p>
                </div>
                <Button
                  variant={market.paused ? 'destructive' : 'outline'}
                  onClick={() => alert(`Toggle pause for ${market.collateralSymbol}/${market.loanSymbol}`)}
                >
                  {market.paused ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                  {market.paused ? 'Paused' : 'Active'}
                </Button>
              </div>
              
              <div className="border-t pt-4">
                <p className="font-medium mb-2">Market Fee</p>
                <p className="text-sm text-gray-500 mb-2">
                  Current: 10% (1000 bps) - Max: 25% (2500 bps)
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value)}
                    placeholder="Fee in bps (0-2500)"
                  />
                  <Button onClick={() => alert(`Set fee to ${newFee} bps`)}>
                    Update Fee
                  </Button>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Pending Fee Shares</p>
                    <p className="text-sm text-gray-500">1,234,567 shares</p>
                  </div>
                  <Button onClick={() => alert('Claim fees to recipient')}>
                    Claim Fees
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Fee recipient must have Position account in this market
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Main App Component
const MorphoSolanaUI: React.FC = () => {
  const [selectedView, setSelectedView] = useState<'markets' | 'dashboard' | 'liquidations' | 'admin'>('markets');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [walletConnected, setWalletConnected] = useState(true); // Mock connected
  
  // Admin check - user cannot change this
  const userIsAdmin = isAdmin(MOCK_WALLET_ADDRESS, MOCK_PROTOCOL_OWNER);
  
  // Prevent non-admin from accessing admin view
  const handleViewChange = (view: 'markets' | 'dashboard' | 'liquidations' | 'admin') => {
    if (view === 'admin' && !userIsAdmin) {
      alert('Access Denied: Only the protocol owner can access the admin panel.');
      return;
    }
    setSelectedView(view);
    setSelectedMarket(null);
  };
  
  const handleMarketSelect = (market: Market) => {
    setSelectedMarket(market);
  };
  
  const handleBackToMarkets = () => {
    setSelectedMarket(null);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-blue-600">Morpho Blue</h1>
              <nav className="flex gap-1">
                <Button
                  variant={selectedView === 'markets' ? 'default' : 'ghost'}
                  onClick={() => handleViewChange('markets')}
                  size="sm"
                >
                  Markets
                </Button>
                <Button
                  variant={selectedView === 'dashboard' ? 'default' : 'ghost'}
                  onClick={() => handleViewChange('dashboard')}
                  size="sm"
                >
                  Dashboard
                </Button>
                <Button
                  variant={selectedView === 'liquidations' ? 'default' : 'ghost'}
                  onClick={() => handleViewChange('liquidations')}
                  size="sm"
                >
                  Liquidations
                </Button>
                
                {/* Only show admin button if user is owner */}
                {userIsAdmin && (
                  <Button
                    variant={selectedView === 'admin' ? 'default' : 'ghost'}
                    onClick={() => handleViewChange('admin')}
                    size="sm"
                    className="text-blue-600"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Admin
                  </Button>
                )}
              </nav>
            </div>
            
            <div className="flex items-center gap-3">
              {userIsAdmin && (
                <Badge variant="outline" className="px-3 py-1 bg-blue-50 border-blue-200 text-blue-700">
                  <Shield className="w-3 h-3 mr-1" />
                  Owner
                </Badge>
              )}
              <Badge variant="outline" className="px-3 py-1">
                Devnet
              </Badge>
              <Button variant={walletConnected ? 'outline' : 'default'}>
                <Wallet className="w-4 h-4 mr-2" />
                {walletConnected ? MOCK_WALLET_ADDRESS : 'Connect Wallet'}
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Markets View */}
        {selectedView === 'markets' && !selectedMarket && (
          <div>
            <div className="mb-6">
              <h2 className="text-3xl font-bold mb-2">Lending Markets</h2>
              <div className="flex gap-6 text-sm text-gray-600">
                <span>Total Markets: {MOCK_MARKETS.length}</span>
                <span>Total TVL: $26.1M</span>
                <span>Total Borrows: $18.4M</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {MOCK_MARKETS.map(market => (
                <MarketCard
                  key={market.id}
                  market={market}
                  onClick={() => handleMarketSelect(market)}
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Market Detail View */}
        {selectedView === 'markets' && selectedMarket && (
          <div>
            <Button variant="ghost" onClick={handleBackToMarkets} className="mb-4">
              ← Back to Markets
            </Button>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Market Stats */}
              <div className="lg:col-span-1 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">
                      {selectedMarket.collateralSymbol} / {selectedMarket.loanSymbol}
                    </CardTitle>
                    <CardDescription>
                      LLTV: {(selectedMarket.lltv / 100).toFixed(0)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Total Supply</p>
                      <p className="text-2xl font-bold">${formatNumber(selectedMarket.totalSupply)}</p>
                      <p className="text-sm text-green-600">APY: {selectedMarket.supplyAPY}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Borrow</p>
                      <p className="text-2xl font-bold">${formatNumber(selectedMarket.totalBorrow)}</p>
                      <p className="text-sm text-orange-600">APY: {selectedMarket.borrowAPY}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Available Liquidity</p>
                      <p className="text-xl font-semibold">${formatNumber(selectedMarket.availableLiquidity)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-2">Utilization</p>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${selectedMarket.utilization}%` }}
                        />
                      </div>
                      <p className="text-sm text-right mt-1">{selectedMarket.utilization.toFixed(1)}%</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Your Position</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500">Supply</p>
                      <p className="text-lg font-semibold">
                        {MOCK_POSITION.supplyAssets} {selectedMarket.loanSymbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${(MOCK_POSITION.supplyAssets * 1).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Borrow</p>
                      <p className="text-lg font-semibold">
                        {MOCK_POSITION.borrowAssets} {selectedMarket.loanSymbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${(MOCK_POSITION.borrowAssets * 1).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-2">Collateral</p>
                      <p className="text-lg font-semibold">
                        {MOCK_POSITION.collateral} {selectedMarket.collateralSymbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${(MOCK_POSITION.collateral * 150).toFixed(2)}
                      </p>
                    </div>
                    <div className="border-t pt-3">
                      <HealthFactorBar healthFactor={MOCK_POSITION.healthFactor} />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right: Action Tabs */}
              <div className="lg:col-span-2">
                <Card>
                  <CardContent className="pt-6">
                    <Tabs defaultValue="supply">
                      <TabsList className="grid grid-cols-7 mb-6">
                        <TabsTrigger value="supply">Supply</TabsTrigger>
                        <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                        <TabsTrigger value="collateral">Collateral</TabsTrigger>
                        <TabsTrigger value="borrow">Borrow</TabsTrigger>
                        <TabsTrigger value="repay">Repay</TabsTrigger>
                        <TabsTrigger value="liquidate">Liquidate</TabsTrigger>
                        <TabsTrigger value="flashloan">Flash Loan</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="supply">
                        <SupplyTab market={selectedMarket} />
                      </TabsContent>
                      
                      <TabsContent value="withdraw">
                        <WithdrawTab market={selectedMarket} position={MOCK_POSITION} />
                      </TabsContent>
                      
                      <TabsContent value="collateral">
                        <CollateralTab market={selectedMarket} position={MOCK_POSITION} />
                      </TabsContent>
                      
                      <TabsContent value="borrow">
                        <BorrowTab market={selectedMarket} position={MOCK_POSITION} />
                      </TabsContent>
                      
                      <TabsContent value="repay">
                        <RepayTab market={selectedMarket} position={MOCK_POSITION} />
                      </TabsContent>
                      
                      <TabsContent value="liquidate">
                        <LiquidateTab market={selectedMarket} />
                      </TabsContent>
                      
                      <TabsContent value="flashloan">
                        <FlashLoanTab market={selectedMarket} />
                      </TabsContent>
                    </Tabs>
                    
                    {/* Authorization Tab (Separate Card Below) */}
                    <Card className="mt-6">
                      <Tabs defaultValue="auth">
                        <TabsList>
                          <TabsTrigger value="auth">
                            <Users className="w-4 h-4 mr-2" />
                            Authorizations
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="auth" className="p-4">
                          <AuthorizationTab />
                        </TabsContent>
                      </Tabs>
                    </Card>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
        
        {/* Dashboard View */}
        {selectedView === 'dashboard' && (
          <div>
            <h2 className="text-3xl font-bold mb-6">Your Portfolio</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Total Supply</p>
                  <p className="text-2xl font-bold">$15,420</p>
                  <p className="text-xs text-green-600 mt-1">+$124 (24h)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Total Borrow</p>
                  <p className="text-2xl font-bold">$8,200</p>
                  <p className="text-xs text-orange-600 mt-1">-$18 (24h)</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Net Position</p>
                  <p className="text-2xl font-bold">$7,220</p>
                  <p className="text-xs text-green-600 mt-1">+1.8%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Avg Health Factor</p>
                  <p className={`text-2xl font-bold ${getHealthColor(2.15)}`}>2.15</p>
                  <Badge variant="outline" className="mt-1 bg-green-50">Safe</Badge>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Active Positions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">SOL / USDC</h3>
                      <p className="text-sm text-gray-500">Market ID: 0xa3f2...8e1c</p>
                    </div>
                    <HealthFactorBar healthFactor={MOCK_POSITION.healthFactor} />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Supply</p>
                      <p className="font-semibold">1,250 USDC</p>
                      <p className="text-xs text-green-600">APY: 4.2% • $1.2/day</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Borrow</p>
                      <p className="font-semibold">75 USDC</p>
                      <p className="text-xs text-orange-600">APY: 8.5% • $0.17/day</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Collateral</p>
                      <p className="font-semibold">1.2 SOL</p>
                      <p className="text-xs text-gray-500">~$180</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedView('markets'); handleMarketSelect(MOCK_MARKETS[0]); }}>
                      Manage
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => alert('Close position - all shares/collateral must be 0')}>
                      Close Position
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Liquidations View */}
        {selectedView === 'liquidations' && (
          <div>
            <div className="mb-6">
              <h2 className="text-3xl font-bold mb-2">Liquidation Opportunities</h2>
              <p className="text-gray-600">
                Unhealthy positions across all markets • Total at risk: $2.95M
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {MOCK_LIQUIDATIONS.map((opp, idx) => {
                const market = MOCK_MARKETS.find(m => m.id === opp.marketId);
                return (
                  <Card key={idx} className="border-red-200">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">
                            {market?.collateralSymbol} / {market?.loanSymbol}
                          </CardTitle>
                          <CardDescription className="font-mono text-xs">
                            {opp.borrower}
                          </CardDescription>
                        </div>
                        <Badge variant="destructive">
                          HF: {opp.healthFactor.toFixed(2)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Collateral</p>
                          <p className="text-lg font-semibold">
                            {opp.collateral} {market?.collateralSymbol}
                          </p>
                          <p className="text-xs text-gray-500">
                            ${(opp.collateral * 150).toFixed(0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Debt</p>
                          <p className="text-lg font-semibold">${opp.debt}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">LIF Bonus</p>
                          <p className="text-lg font-semibold text-green-600">
                            {((opp.lif - 1) * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Est. Profit</p>
                          <p className="text-lg font-semibold text-green-600">
                            ${opp.profit}
                          </p>
                        </div>
                      </div>
                      
                      <Button
                        onClick={() => alert(`Liquidate ${opp.borrower} - Profit: $${opp.profit}`)}
                        variant="destructive"
                        className="w-full"
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Liquidate Now
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Admin View */}
        {selectedView === 'admin' && (
          <div>
            {!userIsAdmin ? (
              // Access Denied Screen
              <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
                <Card className="max-w-md w-full border-red-200">
                  <CardContent className="pt-8 text-center">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                    <h2 className="text-2xl font-bold mb-2 text-red-600">Access Denied</h2>
                    <p className="text-gray-600 mb-4">
                      Only the protocol owner can access the admin panel.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                      <p className="text-xs text-gray-500 mb-1">Protocol Owner:</p>
                      <p className="text-sm font-mono break-all">{MOCK_PROTOCOL_OWNER}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
                      <p className="text-xs text-gray-500 mb-1">Your Wallet:</p>
                      <p className="text-sm font-mono break-all">{MOCK_WALLET_ADDRESS}</p>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                      Only the protocol owner can access administrative functions.
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => handleViewChange('markets')}
                      className="w-full"
                    >
                      Return to Markets
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              // Admin Panel (only for owner)
              <div>
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Shield className="w-8 h-8 text-blue-600" />
                    <h2 className="text-3xl font-bold">Protocol Administration</h2>
                  </div>
                  <p className="text-gray-600">Owner-only controls • 9 admin instructions</p>
                  
                  <Alert className="mt-4 bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">Authenticated as Protocol Owner</AlertTitle>
                    <AlertDescription className="text-green-700 text-xs mt-1 font-mono">
                      {MOCK_WALLET_ADDRESS}
                    </AlertDescription>
                  </Alert>
                </div>
                <AdminPanel />
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>Morpho Blue on Solana • 26 Instructions Implemented</p>
          <p className="mt-1">
            Powered by Anchor Framework • Built with React + TypeScript
          </p>
        </div>
      </footer>
    </div>
  );
};

export default MorphoSolanaUI;
