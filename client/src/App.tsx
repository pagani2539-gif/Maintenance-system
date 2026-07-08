import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import RepairList from './pages/RepairList';
import NewRepair from './pages/NewRepair';
import NewClaim from './pages/NewClaim';
import ClaimList from './pages/ClaimList';
import RepairDetail from './pages/RepairDetail';
import InventoryList from './pages/InventoryList';
import NewWithdrawal from './pages/NewWithdrawal';
import WithdrawalList from './pages/WithdrawalList';
import WithdrawalDetail from './pages/WithdrawalDetail';
import TransactionList from './pages/TransactionList';
import PendingReturns from './pages/PendingReturns';
import MyTasks from './pages/MyTasks';
import StockCountList from './pages/StockCountList';
import StockCountDetail from './pages/StockCountDetail';
import AssetTimeline from './pages/AssetTimeline';
import PurchaseOrderList from './pages/PurchaseOrderList';
import TechnicianStockList from './pages/TechnicianStockList';
import TechnicianStockMovements from './pages/TechnicianStockMovements';
import Technicians from './pages/Technicians';
import Reports from './pages/Reports';
import StationSearch from './pages/StationSearch';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import AuditLogs from './pages/AuditLogs';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
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
              <Route path="technicians" element={<Technicians />} />
              <Route path="reports" element={<Reports />} />
              <Route path="stations" element={<StationSearch />} />
              <Route path="settings" element={<Settings />} />
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
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
