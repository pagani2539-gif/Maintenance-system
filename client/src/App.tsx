import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';

// Route code is loaded only when it is opened. This keeps charts, maps, QR,
// printing, and scanner dependencies out of the initial application bundle.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const RepairList = lazy(() => import('./pages/RepairList'));
const NewRepair = lazy(() => import('./pages/NewRepair'));
const NewClaim = lazy(() => import('./pages/NewClaim'));
const ClaimList = lazy(() => import('./pages/ClaimList'));
const RepairDetail = lazy(() => import('./pages/RepairDetail'));
const InventoryList = lazy(() => import('./pages/InventoryList'));
const NewWithdrawal = lazy(() => import('./pages/NewWithdrawal'));
const WithdrawalList = lazy(() => import('./pages/WithdrawalList'));
const WithdrawalDetail = lazy(() => import('./pages/WithdrawalDetail'));
const TransactionList = lazy(() => import('./pages/TransactionList'));
const PendingReturns = lazy(() => import('./pages/PendingReturns'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const StockCountList = lazy(() => import('./pages/StockCountList'));
const StockCountDetail = lazy(() => import('./pages/StockCountDetail'));
const AssetTimeline = lazy(() => import('./pages/AssetTimeline'));
const PurchaseOrderList = lazy(() => import('./pages/PurchaseOrderList'));
const TechnicianStockList = lazy(() => import('./pages/TechnicianStockList'));
const TechnicianStockMovements = lazy(() => import('./pages/TechnicianStockMovements'));
const Technicians = lazy(() => import('./pages/Technicians'));
const StationSearch = lazy(() => import('./pages/StationSearch'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Login = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <Suspense fallback={<div className="page-loading">กำลังโหลด…</div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            {/* Protected app routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="my-tasks" element={<MyTasks />} />
              <Route path="repairs" element={<RepairList />} />
              <Route path="repairs/:id" element={<RepairDetail />} />
              <Route path="new" element={<NewRepair />} />
              <Route path="claim" element={<NewClaim />} />
              <Route path="claim-history" element={<ClaimList />} />
              <Route path="claim-history/:id" element={<RepairDetail />} />
              <Route path="inventory" element={<InventoryList />} />
              <Route path="withdrawal" element={<NewWithdrawal />} />
              <Route path="withdrawal-history" element={<WithdrawalList />} />
              <Route path="withdrawal/:id" element={<WithdrawalDetail />} />
              <Route path="transactions" element={<TransactionList />} />
              <Route path="pending-returns" element={<PendingReturns />} />
              <Route path="stock-counts" element={<StockCountList />} />
              <Route path="stock-counts/:id" element={<StockCountDetail />} />
              <Route path="asset/:instanceId" element={<AssetTimeline />} />
              <Route path="purchase-orders" element={<PurchaseOrderList />} />
              <Route path="technician-stock" element={<TechnicianStockList />} />
              <Route path="technician-stock/movements" element={<TechnicianStockMovements />} />
              <Route
                path="technicians"
                element={
                  <ProtectedRoute requireFull>
                    <Technicians />
                  </ProtectedRoute>
                }
              />
              <Route path="reports" element={<Reports />} />
              <Route path="stations" element={<StationSearch />} />
              <Route
                path="settings"
                element={
                  <ProtectedRoute requireFull>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute requireFull>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users/audit-logs"
                element={
                  <ProtectedRoute requireFull>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
          </Suspense>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
