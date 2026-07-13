import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { repairApi, UPLOAD_URL } from '../api';
import { useNotification } from '../components/Layout';
import type { RepairDetail as IRepairDetail } from '../types';
import { BackButton } from '../components/ui/BackButton';
import {
  History as HistoryIcon,
  Image as ImageIcon, 
  User, 
  FileText, 
  Trash2, 
  MapPin, 
  Laptop, 
  Wrench,
  PlusCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Settings
} from 'lucide-react';
import PrintTemplate from '../components/PrintTemplate';
import { PrintDialog } from '../components/PrintDialog';
import PermissionGate from '../components/PermissionGate';
import { Select } from '../components/ui/Input';
import StationSelector from '../components/ui/StationSelector';
import FormSection from '../components/ui/FormSection';
import { getApiErrorMessage } from '../utils/apiError';
import Lightbox from '../components/ui/Lightbox';

const RepairDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify, confirm } = useNotification();
  const [repair, setRepair] = useState<IRepairDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [replacingDevice, setReplacingDevice] = useState(false);
  const [updatingEdit, setUpdatingEdit] = useState(false);
  
  const [statusForm, setStatusForm] = useState({ status: '', note: '' });
  const [deviceForm, setDeviceForm] = useState({
    old_serial: '',
    old_model: '',
    new_serial: '',
    new_model: '',
  });
  const [editForm, setEditForm] = useState({
    reporter: '',
    project_name: '',
    location: '',
    station_id: null as number | null,
    station_area_id: null as number | null,
    device_name: '',
    problem: '',
    priority: ''
  });
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    // If it's a space-separated UTC timestamp "YYYY-MM-DD HH:MM:SS", convert to ISO UTC
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      return new Date(dateStr.replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  };

  const fetchRepair = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await repairApi.getById(id);
      setRepair(data);
      setStatusForm({ status: data.status, note: '' });
      setEditForm({
        reporter: data.reporter,
        project_name: data.project_name || '',
        // Keep the original location text intact for legacy records that
        // previously appended a free-form sub-location.
        location: data.location_snapshot || data.location || '',
        station_id: data.station_id || null,
        station_area_id: data.station_area_id || null,
        device_name: data.device_name,
        problem: data.problem,
        priority: data.priority
      });
    } catch (error) {
      console.error('Error fetching repair detail:', error);
      notify('ไม่สามารถดึงข้อมูลรายการนี้ได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    const markAsRead = async () => {
      if (!id) return;
      try {
        await repairApi.markAsRead(id);
      } catch (err) {
        console.error('Failed to mark as read:', err);
      }
    };
    markAsRead();
    const timer = setTimeout(() => {
      fetchRepair();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const trimmedNote = statusForm.note.trim();
    if (trimmedNote.length > 1000) {
      notify('หมายเหตุยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)', 'error');
      return;
    }
    setUpdatingStatus(true);
    try {
      await repairApi.updateStatus(id, { 
        status: statusForm.status, 
        repair_note: trimmedNote, 
        note: trimmedNote,
        user: 'ช่างเทคนิค' 
      });
      notify('อัปเดตสถานะงานเรียบร้อยแล้ว');
      setShowStatusModal(false);
      fetchRepair();
    } catch (err) {
      console.error(err);
      notify(getApiErrorMessage(err, 'อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeviceReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const trimmedOldModel = deviceForm.old_model.trim();
    const trimmedOldSerial = deviceForm.old_serial.trim();
    const trimmedNewModel = deviceForm.new_model.trim();
    const trimmedNewSerial = deviceForm.new_serial.trim();

    if (!trimmedOldModel || !trimmedOldSerial || !trimmedNewModel || !trimmedNewSerial) {
      notify('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง', 'error');
      return;
    }

    if (trimmedOldModel.length > 100 || trimmedOldSerial.length > 100 || trimmedNewModel.length > 100 || trimmedNewSerial.length > 100) {
      notify('ข้อมูลรุ่นหรือ Serial Number ยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error');
      return;
    }

    setReplacingDevice(true);
    try {
      await repairApi.replaceDevice(id, { 
        old_model: trimmedOldModel,
        old_serial: trimmedOldSerial,
        new_model: trimmedNewModel,
        new_serial: trimmedNewSerial,
        technician: 'ช่างเทคนิค' 
      });
      notify('บันทึกการเปลี่ยนอะไหล่เรียบร้อยแล้ว');
      setShowDeviceModal(false);
      fetchRepair();
    } catch (err) {
      console.error(err);
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setReplacingDevice(false);
    }
  };

  const handleEditUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const trimmedReporter = editForm.reporter.trim();
    const trimmedProjectName = editForm.project_name.trim();
    const trimmedLocation = editForm.location.trim();
    const trimmedDeviceName = editForm.device_name.trim();
    const trimmedProblem = editForm.problem.trim();

    if (!trimmedReporter || !trimmedProjectName || !trimmedDeviceName || !trimmedProblem) {
      notify('กรุณากรอกข้อมูลให้ครบถ้วนในช่องที่จำเป็น', 'error');
      return;
    }

    if (trimmedReporter.length > 100) {
      notify('ชื่อผู้เบิกยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error');
      return;
    }
    if (trimmedProjectName.length > 100) {
      notify('ชื่อโครงการยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error');
      return;
    }
    if (trimmedLocation.length > 150) {
      notify('ชื่อสถานที่ยาวเกินไป (ไม่เกิน 150 ตัวอักษร)', 'error');
      return;
    }
    if (trimmedDeviceName.length > 100) {
      notify('ชื่ออุปกรณ์ยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error');
      return;
    }
    if (trimmedProblem.length > 1000) {
      notify('อาการเสียยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)', 'error');
      return;
    }

    setUpdatingEdit(true);
    try {
      await repairApi.update(id, {
        reporter: trimmedReporter,
        project_name: trimmedProjectName,
        location: trimmedLocation,
        station_id: editForm.station_id || undefined,
        station_area_id: editForm.station_area_id || undefined,
        device_name: trimmedDeviceName,
        problem: trimmedProblem,
        priority: editForm.priority
      });
      notify('แก้ไขข้อมูลเรียบร้อยแล้ว');
      setShowEditModal(false);
      fetchRepair();
    } catch (err) {
      console.error(err);
      notify(getApiErrorMessage(err, 'แก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setUpdatingEdit(false);
    }
  };

  const handleDelete = async () => {
    const isClaim = repair?.type === 'claim';
    const msg = isClaim 
      ? 'คุณต้องการลบรายการแจ้งเคลมนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้'
      : 'คุณต้องการลบรายการแจ้งซ่อมนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้';
    if (!id) return;
    const isConfirmed = await confirm({
      title: isClaim ? 'ยืนยันการลบรายการแจ้งเคลม' : 'ยืนยันการลบรายการแจ้งซ่อม',
      message: msg,
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await repairApi.delete(id);
      notify(isClaim ? 'ลบรายการแจ้งเคลมสำเร็จ' : 'ลบรายการแจ้งซ่อมสำเร็จ');
      navigate(isClaim ? '/claim-history' : '/repairs');
    } catch (err) {
      notify(getApiErrorMessage(err, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    }
  };

  const handlePrint = () => {
    if (!repair) return;
    setIsPrintDialogOpen(true);
  };

  const handleBeforePrint = async (companyId: number) => {
    if (!repair) return;
    try {
      await repairApi.updateCompany(repair.id, companyId);
      setRepair(prev => prev ? { ...prev, company_id: companyId } : null);
    } catch (err) {
      console.error('Failed to update company_id:', err);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
      <div className="spinner"></div>
      <p style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>กำลังโหลดรายละเอียด...</p>
    </div>
  );
  if (!repair) {
    const isClaim = window.location.pathname.includes('claim');
    return <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>ไม่พบข้อมูลรายการแจ้ง{isClaim ? 'เคลม' : 'ซ่อม'}</div>;
  }

  return (
    <div className="repair-detail-page" style={{ padding: '0 0 4rem 0' }}>
      <PrintDialog
        open={isPrintDialogOpen}
        onClose={() => setIsPrintDialogOpen(false)}
        templateId="pdf-print-template"
        docTitle={`${repair.type === 'claim' ? 'ใบเคลม' : 'ใบซ่อม'} - ${repair.ticket_no || repair.id}`}
        onBeforePrint={handleBeforePrint}
        renderTemplate={(company, logo) => (
          <PrintTemplate
            repair={repair}
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
        padding: '1rem 2.5rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid var(--glass-border)',
        borderRadius: 0,
        margin: '0 -2.5rem 2.5rem -2.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BackButton />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
              <Wrench size={14} /> แฟ้มบันทึกงานซ่อม
            </div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{repair.ticket_no}</h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <PermissionGate require={[repair.type === 'claim' ? 'delete.claims' : 'delete.repairs']}>
            <button className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={handleDelete}>
              <Trash2 size={18} /> <span className="hide-on-mobile">ลบรายการ</span>
            </button>
          </PermissionGate>
          <button className="btn btn-primary" style={{ background: 'var(--text-main)' }} onClick={handlePrint}>
            <FileText size={18} /> <span className="hide-on-mobile">พิมพ์ใบงาน</span>
          </button>
          <PermissionGate require={repair.type === 'claim' ? 'manage.claims' : 'manage.repairs'}>
            <button className="btn btn-primary" onClick={() => setShowStatusModal(true)}>
              <CheckCircle2 size={18} /> <span className="hide-on-mobile">อัปเดตสถานะ</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="responsive-page-content" style={{ padding: '0 2.5rem' }}>
        {/* Metadata Strip */}
        <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', padding: '1.5rem 2rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>สถานะ</label>
              <span className={`badge badge-${repair.status}`} style={{ fontSize: '0.85rem', padding: '6px 16px', fontWeight: 800 }}>
                {repair.status}
              </span>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>ความสำคัญ</label>
              <p className={`priority-${repair.priority === 'วิกฤต' || repair.priority === 'ด่วนมาก' ? 'high' : repair.priority === 'ด่วน' ? 'medium' : 'low'}`} style={{ fontWeight: 800, margin: 0, fontSize: '1.1rem' }}>{repair.priority}</p>
            </div>
            <div className="hide-on-tablet">
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>วันที่ได้รับแจ้ง</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}><Clock size={16} color="var(--primary)"/> {parseDate(repair.received_at).toLocaleString('th-TH')}</div>
            </div>
            <div className="hide-on-tablet">
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>อัปเดตล่าสุด</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.95rem' }}><Settings size={16} color="var(--primary)"/> {parseDate(repair.updated_at).toLocaleString('th-TH')}</div>
            </div>
          </div>
          <PermissionGate require={repair.type === 'claim' ? 'manage.claims' : 'manage.repairs'}>
            <button className="btn btn-outline" style={{ borderRadius: '12px' }} onClick={() => setShowEditModal(true)}>
               <Settings size={18} /> แก้ไขข้อมูล
            </button>
          </PermissionGate>
        </div>

        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '8fr 4fr', gap: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Core Info Card */}
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={28} color="var(--primary)" /> รายละเอียดงาน{repair.type === 'claim' ? 'เคลม' : 'ซ่อม'}
                </h3>
                <div style={{ padding: '8px 16px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem' }}>
                  รหัสงาน: #{repair.id}
                </div>
              </div>

              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="info-item">
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    ผู้แจ้ง / หน่วยงาน
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, background: 'var(--bg-app)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={18} color="var(--primary)" />
                    </div>
                    <p style={{ fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>{repair.reporter}</p>
                  </div>
                </div>
                <div className="info-item">
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    ชื่ออุปกรณ์ / รุ่น
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, background: 'var(--bg-app)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Laptop size={18} color="var(--primary)" />
                    </div>
                    <p style={{ fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>{repair.device_name}</p>
                  </div>
                </div>
                <div className="info-item">
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    โครงการ / งาน
                  </label>
                  <p style={{ fontWeight: 700, margin: 0, paddingLeft: '46px' }}>{repair.project_name || '-'}</p>
                </div>
                <div className="info-item">
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    สถานที่ / หน้างาน
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '46px' }}>
                    <MapPin size={16} color="var(--danger)" />
                    <p style={{ fontWeight: 700, margin: 0 }}>
                      {repair.station_name
                        ? `${repair.station_name}${repair.location_snapshot && repair.location_snapshot.startsWith(repair.station_name) && repair.location_snapshot.length > repair.station_name.length ? ' - ' + repair.location_snapshot.slice(repair.station_name.length).replace(/^[-\s]+/, '') : ''}`
                        : (repair.location || repair.location_snapshot || '-')}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>อาการเสีย / ปัญหาที่พบ</label>
                <div style={{ background: 'var(--bg-app)', padding: '2rem', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '1.1rem', lineHeight: '1.7', fontWeight: 500, color: 'var(--text-main)' }}>
                  {repair.problem}
                </div>
              </div>

              {repair.repair_note && (
                <div style={{ marginTop: '2rem' }}>
                  <label style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>บันทึกการแก้ไขจากช่าง (Final Solution)</label>
                  <div style={{ background: 'var(--success-light)', padding: '2rem', borderRadius: '20px', border: '1px solid var(--success-border)', color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', gap: '1rem' }}>
                    <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
                    {repair.repair_note}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Card */}
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '2.5rem' }}>
              <h3 style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', fontWeight: 800 }}>
                <HistoryIcon size={24} color="var(--primary)" /> บันทึกกิจกรรมและประวัติการตรวจสอบ
              </h3>
              <div className="timeline" style={{ paddingLeft: '0.5rem' }}>
                {repair.logs.map((log, index) => (
                  <div key={log.id} style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem', position: 'relative' }}>
                    <div style={{ flexShrink: 0, width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ 
                        width: '20px', 
                        height: '20px', 
                        borderRadius: '50%', 
                        backgroundColor: index === 0 ? 'var(--primary)' : 'var(--border-hover)',
                        zIndex: 1,
                        boxShadow: index === 0 ? '0 0 0 6px var(--primary-light)' : 'none',
                        border: '3px solid white'
                      }}></div>
                      {index !== repair.logs.length - 1 && <div style={{ flexGrow: 1, width: '2px', backgroundColor: 'var(--border)', margin: '6px 0' }}></div>}
                    </div>
                    <div style={{ background: index === 0 ? 'var(--bg-app)' : 'transparent', padding: index === 0 ? '1.25rem' : '0', borderRadius: '16px', flex: 1, transition: 'all 0.3s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: index === 0 ? 'var(--primary)' : 'var(--text-main)' }}>{log.action}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '99px' }}>{parseDate(log.created_at).toLocaleString('th-TH')}</span>
                      </div>
                      <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: '1.6', fontWeight: 500 }}>{log.note}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 800 }}>
                        <div style={{ width: 24, height: 24, background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={12} color="var(--primary)" />
                        </div>
                        {log.user}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Info Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Evidence Card */}
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '1.75rem' }}>
              <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem', fontWeight: 800 }}>
                <ImageIcon size={20} color="var(--primary)" /> แกลเลอรีหลักฐาน
              </h3>
              {repair.images.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  {repair.images.map(img => (
                    <div key={img.id} style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'zoom-in', boxShadow: 'var(--elevation-1)', transition: 'transform 0.2s' }}>
                      <img
                        src={`${UPLOAD_URL}/uploads/${img.file_path}`}
                        crossOrigin="anonymous"
                        alt="repair evidence"
                        style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                        onClick={() => setActiveLightboxImage(`${UPLOAD_URL}/uploads/${img.file_path}`)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'var(--bg-app)', borderRadius: '20px', border: '2px dashed var(--border)' }}>
                  <ImageIcon size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>ไม่มีรูปภาพประกอบในเคสนี้</p>
                </div>
              )}
            </div>

            {/* Components Card */}
            <div className="card glass-card" style={{ borderRadius: '24px', padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Wrench size={20} color="var(--primary)" /> อะไหล่ที่เปลี่ยน
                </h3>
                <PermissionGate require={repair.type === 'claim' ? 'manage.claims' : 'manage.repairs'}>
                  <button className="btn btn-outline" style={{ padding: '6px', border: 'none' }} onClick={() => setShowDeviceModal(true)}>
                    <PlusCircle size={20} />
                  </button>
                </PermissionGate>
              </div>
              {repair.devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', background: 'var(--bg-app)', borderRadius: '20px' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>ยังไม่มีประวัติการเปลี่ยนอะไหล่</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {repair.devices.map(dev => (
                    <div key={dev.id} style={{ padding: '1.25rem', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '0.9rem' }}>
                      <div style={{ marginBottom: '1rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                        <Calendar size={14} /> {parseDate(dev.changed_at).toLocaleDateString('th-TH')}
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', marginBottom: '4px' }}>อุปกรณ์ที่ถอดออก</div>
                         <div style={{ fontWeight: 800 }}>{dev.old_model}</div>
                         <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>S/N (หมายเลขเครื่อง): {dev.old_serial}</div>
                      </div>
                      <div>
                         <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', marginBottom: '4px' }}>อุปกรณ์ที่ติดตั้งใหม่</div>
                         <div style={{ fontWeight: 800 }}>{dev.new_model}</div>
                         <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>S/N (หมายเลขเครื่อง): {dev.new_serial}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Basic Info Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3><Settings size={20} color="var(--primary)" /> แก้ไขข้อมูลใบแจ้ง{repair.type === 'claim' ? 'เคลม' : 'ซ่อม'}</h3>
            <form onSubmit={handleEditUpdate}>
              <FormSection title="ข้อมูลการแจ้ง" icon={<FileText size={18} />} columns={1}>
                <div className="form-group">
                  <label>ชื่อผู้เบิก / หน่วยงาน</label>
                  <input type="text" required maxLength={100} value={editForm.reporter} onChange={e => setEditForm({...editForm, reporter: e.target.value})} disabled={updatingEdit} />
                </div>
                <div className="form-group">
                  <label>โครงการ / งาน</label>
                  <input type="text" required maxLength={100} value={editForm.project_name} onChange={e => setEditForm({...editForm, project_name: e.target.value})} disabled={updatingEdit} />
                </div>
                <Select
                  label="ความสำคัญ"
                  value={editForm.priority}
                  onChange={e => setEditForm({...editForm, priority: e.target.value})}
                  disabled={updatingEdit}
                  triggerStyle={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    fontSize: '0.95rem',
                    color: 'var(--text-main)',
                    backgroundColor: 'var(--bg-card)'
                  }}
                >
                  <option value="ปกติ">ปกติ</option>
                  <option value="ด่วน">ด่วน</option>
                  <option value="ด่วนมาก">ด่วนมาก</option>
                  <option value="วิกฤต">วิกฤต</option>
                </Select>
              </FormSection>

              <FormSection title="สถานที่ / ด่าน" icon={<MapPin size={18} />} columns={1}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>สถานที่ / ด่านชั่ง</label>
                  <StationSelector
                    selectedStationId={editForm.station_id || undefined}
                    showArea={false}
                    onChange={(data) => {
                      setEditForm({
                        ...editForm,
                        station_id: data.stationId || null,
                        station_area_id: null,
                        location: data.stationName || ''
                      });
                    }}
                  />
                </div>
              </FormSection>

              <FormSection title="อุปกรณ์และอาการ" icon={<Wrench size={18} />} columns={1}>
                <div className="form-group">
                  <label>อุปกรณ์ / รุ่น</label>
                  <input type="text" required maxLength={100} value={editForm.device_name} onChange={e => setEditForm({...editForm, device_name: e.target.value})} disabled={updatingEdit} />
                </div>
                <div className="form-group">
                  <label>อาการเสีย/ปัญหา</label>
                  <textarea rows={3} required maxLength={1000} value={editForm.problem} onChange={e => setEditForm({...editForm, problem: e.target.value})} disabled={updatingEdit}></textarea>
                </div>
              </FormSection>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)} disabled={updatingEdit}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={updatingEdit}>บันทึกการแก้ไข</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3><CheckCircle2 size={20} color="var(--primary)" /> อัปเดตสถานะงาน</h3>
            <form onSubmit={handleStatusUpdate}>
              <Select 
                label="เปลี่ยนสถานะเป็น"
                value={statusForm.status} 
                onChange={e => setStatusForm({...statusForm, status: e.target.value})} 
                disabled={updatingStatus}
                style={{ marginBottom: '1.25rem' }}
                triggerStyle={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  fontSize: '0.95rem',
                  color: 'var(--text-main)',
                  backgroundColor: 'var(--bg-card)'
                }}
              >
                <option value="รอดำเนินการ">รอดำเนินการ</option>
                <option value="กำลังซ่อม">กำลังซ่อม</option>
                <option value="รออะไหล่">รออะไหล่</option>
                <option value="เสร็จสิ้น">เสร็จสิ้น</option>
              </Select>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label>บันทึกสรุปผล / หมายเหตุ</label>
                <textarea rows={4} maxLength={1000} value={statusForm.note} onChange={e => setStatusForm({...statusForm, note: e.target.value})} placeholder="ระบุรายละเอียดการดำเนินการ..." disabled={updatingStatus}></textarea>
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowStatusModal(false)} disabled={updatingStatus}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={updatingStatus}>ยืนยันการบันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Replacement Modal */}
      {showDeviceModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h3><Wrench size={20} color="var(--primary)" /> บันทึกการเปลี่ยนอะไหล่</h3>
            <form onSubmit={handleDeviceReplace}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>ข้อมูลอุปกรณ์เดิม</h4>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>รุ่นอุปกรณ์</label>
                    <input type="text" required placeholder="ระบุรุ่นที่ถอดออก" maxLength={100} value={deviceForm.old_model} onChange={e => setDeviceForm({...deviceForm, old_model: e.target.value})} disabled={replacingDevice} />
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>หมายเลขเครื่อง (S/N)</label>
                    <input type="text" required placeholder="ระบุ Serial เดิม" maxLength={100} value={deviceForm.old_serial} onChange={e => setDeviceForm({...deviceForm, old_serial: e.target.value})} disabled={replacingDevice} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--success)' }}>ข้อมูลอุปกรณ์ใหม่</h4>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>รุ่นอุปกรณ์</label>
                    <input type="text" required placeholder="ระบุรุ่นที่ติดตั้งใหม่" maxLength={100} value={deviceForm.new_model} onChange={e => setDeviceForm({...deviceForm, new_model: e.target.value})} disabled={replacingDevice} />
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>หมายเลขเครื่อง (S/N)</label>
                    <input type="text" required placeholder="ระบุ Serial ใหม่" maxLength={100} value={deviceForm.new_serial} onChange={e => setDeviceForm({...deviceForm, new_serial: e.target.value})} disabled={replacingDevice} />
                  </div>
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowDeviceModal(false)} disabled={replacingDevice}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={replacingDevice}>ยืนยันการเปลี่ยน</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeLightboxImage && (
        <Lightbox 
          src={activeLightboxImage} 
          alt="รูปภาพหลักฐานการทำงาน" 
          onClose={() => setActiveLightboxImage(null)} 
        />
      )}
    </div>
  );
};

export default RepairDetail;
