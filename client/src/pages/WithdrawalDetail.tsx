import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { withdrawalApi, transactionApi } from '../api';
import { useNotification } from '../components/Layout';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Skeleton } from '../components/ui/Skeleton';
import Select from '../components/ui/Select';
import { formatDateTimeThai } from '../utils/formatDate';
import {
  FileText,
  Calendar, 
  User, 
  Package, 
  Download,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Trash2,
  MapPin,
  ArrowUpCircle,
  Clock,
  Check,
  Upload,
  X
} from 'lucide-react';
import PrintWithdrawalTemplate from '../components/PrintWithdrawalTemplate';
import { PrintDialog } from '../components/PrintDialog';
import PermissionGate from '../components/PermissionGate';
import { ProvideSnModal } from '../components/ProvideSnModal';
import type { InventoryTransaction } from '../types';
import { compressImage } from '../utils/imageCompressor';

const WithdrawalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify, confirm } = useNotification();
  const { user, hasPermission } = useAuth();

  const [snModal, setSnModal] = useState<{
    isOpen: boolean;
    itemId: number | null;
    itemName: string;
    totalQty: number;
    existingSns: string[];
  }>({
    isOpen: false,
    itemId: null,
    itemName: '',
    totalQty: 0,
    existingSns: []
  });

  const [returnModal, setReturnModal] = useState<{
    isOpen: boolean;
    transaction: InventoryTransaction | null;
  }>({
    isOpen: false,
    transaction: null
  });

  const [returning, setReturning] = useState(false);
  const [returnCondition, setReturnCondition] = useState<string>('Good');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [returnImageFile, setReturnImageFile] = useState<File | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  const { data: withdrawal, loading, request: fetchWithdrawal, setData: setWithdrawal } = useApi(
    async (idVal: string | number) => await withdrawalApi.getById(idVal)
  );

  const { data: transactions = [], loading: loadingTx, request: fetchTransactions } = useApi(
    async (wdId: string | number) => await transactionApi.getAll({ withdrawal_id: wdId })
  );

  useEffect(() => {
    if (id) {
      fetchWithdrawal(id);
      fetchTransactions(id);
    }
  }, [id, fetchWithdrawal, fetchTransactions]);

  const handleReturn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!returnModal.transaction) return;
    
    const formDataObj = new FormData(e.currentTarget);
    const condition = formDataObj.get('condition') as string;
    const note = (formDataObj.get('note') as string || '').trim();
    const imageFile = returnImageFile;

    setReturning(true);
    try {
      const formData = new FormData();
      formData.append('transaction_id', String(returnModal.transaction.id));
      formData.append('inventory_id', String(returnModal.transaction.inventory_id));
      if (returnModal.transaction.instance_id) {
        formData.append('instance_id', String(returnModal.transaction.instance_id));
      }
      formData.append('quantity', String(returnModal.transaction.quantity_borrowed || returnModal.transaction.quantity_withdrawn || 1));
      formData.append('condition', condition);
      formData.append('note', note);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      await transactionApi.return(formData);
      notify('บันทึกการคืนอุปกรณ์เรียบร้อยแล้ว');
      closeReturnModal();
      if (id) {
        fetchWithdrawal(id);
        fetchTransactions(id);
      }
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกการคืนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setReturning(false);
    }
  };

  const closeReturnModal = () => {
    setReturnModal({ isOpen: false, transaction: null });
    setImagePreview(null);
    setReturnImageFile(null);
    setReturnCondition('Good');
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setReturnImageFile(compressed);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        console.error('Image compression failed:', err);
        setReturnImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    } else {
      setReturnImageFile(null);
      setImagePreview(null);
    }
  };

  const getBadgeClass = (type: string) => {
    switch (type) {
      case 'ติดตั้งใหม่':
        return 'badge-withdrawal-install';
      case 'ซ่อมแซม':
        return 'badge-withdrawal-repair';
      case 'สำรองใช้งาน':
        return 'badge-withdrawal-backup';
      case 'ทดสอบ':
        return 'badge-withdrawal-test';
      default:
        return 'badge-withdrawal-custom';
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบประวัติการเบิก',
      message: 'คุณต้องการลบประวัติการเบิกนี้ใช่หรือไม่? ระบบจะทำการคืนสต็อกอุปกรณ์ทั้งหมดในรายการนี้ให้โดยอัตโนมัติ\nการลบประวัตินี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await withdrawalApi.delete(id);
      notify('ลบประวัติและคืนสต็อกเรียบร้อยแล้ว');
      navigate('/withdrawal');
    } catch (err) {
      notify(getApiErrorMessage(err, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    }
  };

  const handlePrint = () => {
    setIsPrintDialogOpen(true);
  };

  const handleBeforePrint = async (companyId: number) => {
    if (!withdrawal) return;
    try {
      await withdrawalApi.updateCompany(withdrawal.id, companyId);
      setWithdrawal(prev => prev ? { ...prev, company_id: companyId } : null);
    } catch (err) {
      console.error('Failed to update company_id:', err);
    }
  };

  if (loading) return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton variant="rect" width="100px" height="40px" />
        <div style={{ display: 'flex', gap: '10px' }}>
          <Skeleton variant="rect" width="120px" height="40px" />
          <Skeleton variant="rect" width="160px" height="40px" />
        </div>
      </div>
      <Skeleton variant="rect" height="120px" />
      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '2rem' }}>
        <Skeleton variant="rect" height="300px" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <Skeleton variant="rect" height="150px" />
          <Skeleton variant="rect" height="150px" />
        </div>
      </div>
    </div>
  );

  if (!withdrawal) return (
    <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
      <Card style={{ padding: '4rem 2rem', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>ไม่พบข้อมูลการเบิก</p>
        <Button variant="outline" onClick={() => navigate('/withdrawal')} style={{ marginTop: '1.5rem' }}>
          กลับไปหน้าการเบิกจ่าย
        </Button>
      </Card>
    </div>
  );

  return (
    <div className="withdrawal-detail-page" style={{ padding: '0 0 4rem 0', minHeight: '100vh' }}>
      <PrintDialog
        open={isPrintDialogOpen}
        onClose={() => setIsPrintDialogOpen(false)}
        templateId="pdf-withdrawal-template"
        docTitle={`ใบเบิก - WD-${String(withdrawal.id).padStart(6, '0')}`}
        onBeforePrint={handleBeforePrint}
        renderTemplate={(company, logo) => (
          <PrintWithdrawalTemplate
            withdrawal={withdrawal}
            company={company}
            logo={logo}
          />
        )}
      />

      {/* Sticky Glass Header */}
      <div className="glass-card responsive-detail-toolbar" style={{
        position: 'sticky', 
        top: 0, 
        zIndex: 20, 
        borderBottom: '1px solid var(--glass-border)',
        borderRadius: 0,
        backgroundColor: 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        margin: '0 0 2.5rem 0'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <BackButton />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <Package size={14} /> บันทึกการเบิกพัสดุ
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>WD-{withdrawal.id.toString().padStart(6, '0')}</h2>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <PermissionGate require="delete.withdrawals">
              <button className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={handleDelete}>
                <Trash2 size={18} /> <span className="hide-on-mobile">ลบประวัติ</span>
              </button>
            </PermissionGate>
            <button className="btn btn-primary" style={{ background: 'var(--text-main)' }} onClick={handlePrint}>
              <Download size={18} /> <span className="hide-on-mobile">พิมพ์ใบเบิก (PDF)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2.5rem' }}>
        {/* Metadata Strip */}
        <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', padding: '1.5rem 2rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>ประเภทการทำรายการ</label>
              <span className={`badge ${getBadgeClass(withdrawal.type)}`} style={{ fontSize: '0.85rem', padding: '6px 16px', fontWeight: 800 }}>
                {withdrawal.type}
              </span>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>วันที่เบิกจ่าย</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}><Calendar size={16} color="var(--primary)"/> {withdrawal.withdrawal_date ? new Date(`${withdrawal.withdrawal_date}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : formatDateTimeThai(withdrawal.created_at)}</div>
              {withdrawal.withdrawal_date && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '3px' }}>บันทึกเข้าระบบ {formatDateTimeThai(withdrawal.created_at)}</div>}
            </div>
            <div className="hide-on-tablet">
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>ชื่อโครงการ</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}><FileText size={16} color="var(--primary)"/> {withdrawal.project_name || '-'}</div>
            </div>
            <div className="hide-on-tablet">
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>สถานที่ใช้งาน</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}>
                <MapPin size={16} color="var(--danger)"/> {withdrawal.location || '-'}
              </div>
            </div>
            {withdrawal.contract_no && (
              <div className="hide-on-tablet">
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>สัญญา / ปี</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}>
                  <FileText size={16} color="var(--info)"/> {withdrawal.contract_no} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>(ปี {withdrawal.contract_year})</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)', marginBottom: '4px' }}>สถานะ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>
              <CheckCircle2 size={18} /> จ่ายอุปกรณ์แล้ว
            </div>
          </div>
        </div>

        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '8fr 4fr', gap: '2rem', marginBottom: '3rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2.5rem' }}>
              <h3 style={{ margin: '0 0 2rem 0', fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Package size={28} color="var(--primary)" /> รายการอุปกรณ์ที่เบิก
              </h3>
              
              <div className="data-table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--border-hover)' }}>
                <table className="data-table data-table--fit" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>รายการ</th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>หมายเลขเครื่อง (S/N)</th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>จำนวน</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(withdrawal.items || []).map((item, idx: number) => {
                      const currentSns = item.serial_numbers ? item.serial_numbers.split(', ').filter(s => s.trim()) : [];
                      const isMissingSn = item.requires_sn === 1 && currentSns.length < item.quantity;

                      return (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '1.25rem 1rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>{item.item_name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{item.item_model || '-'}</div>
                          </td>
                          <td style={{ padding: '1.25rem 1rem' }}>
                            {item.requires_sn === 1 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {currentSns.map((sn: string, i: number) => (
                                  <span key={i} className="glass-card" style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--primary-light)' }}>
                                    {sn}
                                  </span>
                                ))}
                                {isMissingSn && (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 700, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={14} /> ขาด {item.quantity - currentSns.length} S/N
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>อุปกรณ์ทั่วไป (ไม่มี S/N)</span>
                            )}
                          </td>
                          <td style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>{item.quantity}</div>
                          </td>
                          <td style={{ padding: '1.25rem 1rem', textAlign: 'right' }}>
                            {isMissingSn && (
                              <button 
                                className="btn btn-primary btn-sm"
                                onClick={() => setSnModal({
                                  isOpen: true,
                                  itemId: item.id,
                                  itemName: item.item_name,
                                  totalQty: item.quantity,
                                  existingSns: currentSns
                                })}
                                style={{ borderRadius: '10px', fontSize: '0.75rem' }}
                              >
                                ระบุ S/N
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Related Transactions Section */}
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2.5rem' }}>
              <h3 style={{ margin: '0 0 2rem 0', fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Clock size={28} color="var(--primary)" /> รายการธุรกรรมที่เกี่ยวข้อง
              </h3>
              
              <div className="data-table-container" style={{ width: '100%', overflowX: 'auto', borderRadius: '16px', border: '1px solid var(--border-hover)' }}>
                <table className="data-table data-table--fit" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>วันที่ / รหัสอ้างอิง</th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>อุปกรณ์</th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>จำนวน</th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>สถานะ</th>
                      <th style={{ textAlign: 'right', padding: '1rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTx ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>กำลังโหลดข้อมูลธุรกรรม...</td></tr>
                    ) : transactions.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ไม่พบข้อมูลธุรกรรมที่เกี่ยวข้อง</td></tr>
                    ) : (
                      transactions.map((tx: InventoryTransaction, idx: number) => (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{formatDateTimeThai(tx.created_at)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TX-{tx.id.toString().padStart(6, '0')}</div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tx.product_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>S/N: {tx.serial_number || 'ไม่ระบุ'}</div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700 }}>{tx.quantity_withdrawn || tx.quantity_borrowed || tx.quantity_returned || tx.quantity_added}</div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {tx.status === 'RETURNED' ? (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>คืนแล้ว</span>
                            ) : (
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>อยู่ระหว่างใช้งาน</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            {hasPermission('manage.transactions') && tx.status !== 'RETURNED' && (tx.transaction_type === 'WITHDRAW' || tx.transaction_type === 'BORROW') && (
                              <button 
                                className="btn btn-outline btn-sm"
                                onClick={() => setReturnModal({ isOpen: true, transaction: tx })}
                                style={{ borderRadius: '10px', fontSize: '0.75rem', padding: '6px 12px' }}
                              >
                                <ArrowUpCircle size={14} style={{ marginRight: '4px' }} /> คืนของ
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2rem' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={20} color="var(--primary)" /> ผู้เบิกรับอุปกรณ์
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                <div style={{ width: 48, height: 48, background: 'var(--bg-app)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={24} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ผู้รับพัสดุ</div>
                  <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{withdrawal.recipient}</div>
                </div>
              </div>
              <div style={{ padding: '1.25rem', background: 'var(--bg-app)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>โครงการ</label>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{withdrawal.project_name || '-'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>รายละเอียดสถานที่</label>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{withdrawal.location || '-'}</div>
                  {withdrawal.station_area_name && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                      จุดติดตั้ง (Area): {withdrawal.station_area_name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MessageSquare size={20} color="var(--primary)" /> หมายเหตุบันทึก
              </h3>
              <div style={{ padding: '1.25rem', background: 'var(--bg-app)', borderRadius: '16px', border: '1px solid var(--border)', fontSize: '0.95rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-main)', minHeight: '120px' }}>
                {withdrawal.note || 'ไม่มีข้อมูลหมายเหตุเพิ่มเติม'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ProvideSnModal 
        isOpen={snModal.isOpen}
        onClose={() => setSnModal({ ...snModal, isOpen: false })}
        onSuccess={() => id && fetchWithdrawal(id)}
        title={`ระบุ S/N ย้อนหลัง: ${snModal.itemName}`}
        totalQuantity={snModal.totalQty}
        existingSns={snModal.existingSns}
        onSubmit={async (newSns) => {
          if (id && snModal.itemId) {
            await withdrawalApi.updateItemSn(id, snModal.itemId, newSns);
          }
        }}
      />

      {returnModal.isOpen && returnModal.transaction && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3><ArrowUpCircle size={22} color="var(--primary)" /> คืนอุปกรณ์เข้าคลัง</h3>
              <button className="close-btn" onClick={closeReturnModal}><X size={20} /></button>
            </div>

            <form onSubmit={handleReturn}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>รายการที่จะคืน</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{returnModal.transaction.product_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>S/N: {returnModal.transaction.serial_number || 'ไม่ระบุ'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>จำนวน: {returnModal.transaction.quantity_borrowed || returnModal.transaction.quantity_withdrawn || 1} ชิ้น</div>
                </Card>

                <div className="form-group">
                  <label>ผู้คืนอุปกรณ์</label>
                  <div style={{
                    padding: '10px 14px', background: 'var(--bg-app)',
                    border: '1px solid var(--border)', borderRadius: '10px',
                    fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <User size={16} color="var(--text-muted)" />
                    {user?.full_name || '—'}
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      (ดึงจากบัญชี)
                    </span>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>สภาพอุปกรณ์</label>
                    <Select
                      value={returnCondition}
                      options={[
                        { label: 'ใช้งานได้ปกติ', value: 'Good' },
                        { label: 'ชำรุดเล็กน้อย', value: 'Minor Damage' },
                        { label: 'ชำรุด', value: 'Damaged' },
                        { label: 'เสีย/ใช้งานไม่ได้', value: 'Broken' }
                      ]}
                      onChange={(val) => setReturnCondition(String(val))}
                    />
                    <input type="hidden" name="condition" value={returnCondition} />
                  </div>
                </div>

                <div className="form-group">
                  <label>หมายเหตุ</label>
                  <textarea name="note" rows={2} placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)..."></textarea>
                </div>

                <div className="form-group">
                  <label>รูปภาพหลักฐานการคืน (ถ้ามี)</label>
                  <div className="image-uploader-grid">
                    {imagePreview ? (
                      <div className="image-preview-card" style={{ width: '100%', height: '180px' }}>
                        <img src={imagePreview} alt="Return preview" style={{ objectFit: 'contain' }} />
                        <button type="button" className="remove-btn" onClick={() => { setImagePreview(null); setReturnImageFile(null); }}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <label className="image-uploader-box" style={{ height: '120px', background: 'var(--bg-app)' }}>
                        <Upload size={24} style={{ marginBottom: '8px' }} />
                        <span style={{ fontSize: '0.85rem' }}>คลิกเพื่ออัปโหลดรูปภาพ</span>
                        <input 
                          type="file" 
                          name="return_image" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={handleImageChange}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '2rem' }}>
                <Button type="button" variant="outline" onClick={closeReturnModal} disabled={returning}>ยกเลิก</Button>
                <Button type="submit" variant="primary" loading={returning} icon={<Check size={18} />}>
                  ยืนยันการคืนอุปกรณ์
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


export default WithdrawalDetail;
