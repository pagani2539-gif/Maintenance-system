import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { repairApi, stationApi } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input, TextArea, Select } from '../components/ui/Input';
import StationSelector from '../components/ui/StationSelector';
import StationAssetPicker from '../components/ui/StationAssetPicker';
import FormSection from '../components/ui/FormSection';
import { getApiErrorMessage } from '../utils/apiError';
import {
  Upload,
  X,
  FileText,
  MapPin,
  ShieldAlert,
  Image as ImageIcon
} from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';
import type { AssetLifecycleItem } from '../types';

const NewClaim: React.FC = () => {
  const navigate = useNavigate();
  const locationSearch = useLocation();
  const { notify, refreshUnreadCounts, playNotificationSound } = useNotification();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    project_name: '',
    location: '',
    station_id: undefined as number | undefined,
    device_name: '',
    problem: '',
    priority: 'ปกติ',
    received_at: new Date().toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16),
    instance_id: undefined as number | undefined,
    inventory_id: undefined as number | undefined
  });
  const [images, setImages] = useState<File[]>([]);

  const searchParams = new URLSearchParams(locationSearch.search);
  const stationIdParam = searchParams.get('station_id');

  useEffect(() => {
    if (stationIdParam) {
      const stationId = parseInt(stationIdParam, 10);
      if (!isNaN(stationId)) {
        stationApi.getUniqueList({ status: 1 }).then(list => {
          const matched = list.find(st => st.id === stationId);
          if (matched) {
            setFormData(prev => ({
              ...prev,
              station_id: matched.id,
              location: matched.name
            }));
          }
        }).catch(err => {
          console.error('Failed to prefetch station for prefill:', err);
        });
      }
    }
  }, [stationIdParam]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files);
      if (images.length + newImages.length > 4) {
        notify('จำกัดการอัปโหลดสูงสุด 4 รูปเท่านั้น', 'error');
        return;
      }
      try {
        const compressed = await Promise.all(newImages.map(file => compressImage(file)));
        setImages([...images, ...compressed]);
      } catch (err) {
        console.error('Image compression failed:', err);
        setImages([...images, ...newImages]);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const trimmedProjectName = formData.project_name.trim();
    const trimmedLocation = formData.location.trim();
    const trimmedDeviceName = formData.device_name.trim();
    const trimmedProblem = formData.problem.trim();

    if (!trimmedProjectName || !formData.station_id || !trimmedDeviceName || !trimmedProblem) {
      notify('กรุณากรอกข้อมูลให้ครบถ้วนในช่องที่จำเป็น', 'error');
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
      notify('เหตุผลการเคลมยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)', 'error');
      return;
    }

    const oversized = images.some(img => img.size > 5 * 1024 * 1024);
    if (oversized) {
      notify('บางรูปภาพมีขนาดใหญ่เกินไป (จำกัดรูปละ 5MB)', 'error');
      return;
    }

    setLoading(true);

    try {
      const data = new FormData();
      data.append('project_name', trimmedProjectName);
      data.append('location', trimmedLocation);
      if (formData.station_id) {
        data.append('station_id', String(formData.station_id));
      }
      data.append('device_name', trimmedDeviceName);
      data.append('problem', trimmedProblem);
      data.append('priority', formData.priority);
      data.append('received_at', new Date(formData.received_at).toISOString());
      
      if (formData.instance_id) {
        data.append('instance_id', String(formData.instance_id));
      }
      if (formData.inventory_id) {
        data.append('inventory_id', String(formData.inventory_id));
      }
      
      images.forEach(image => {
        data.append('images', image);
      });

      await repairApi.createClaim(data);
      notify('ส่งข้อมูลเคลมเรียบร้อยแล้ว');
      playNotificationSound();
      refreshUnreadCounts();
      navigate('/repairs');
    } catch (error) {
      console.error('Error creating claim:', error);
      notify(getApiErrorMessage(error, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-claim-page responsive-page-content" style={{ padding: '2rem' }}>
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div className="page-title">
          <h2>แจ้งเคลมอุปกรณ์</h2>
          <p>กรอกรายละเอียดการเคลมอุปกรณ์ที่ต้องการส่งเข้าศูนย์บริการเพื่อตรวจเช็ค</p>
        </div>
      </div>
      
      <Card className="glass-card responsive-form-card" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', overflow: 'visible' }}>
        <form onSubmit={handleSubmit}>
          {/* ① ข้อมูลการแจ้งเคลม */}
          <FormSection title="ข้อมูลการแจ้งเคลม" icon={<FileText size={18} />}>
            <div style={{ gridColumn: '1 / -1' }} className="form-group">
              <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>ผู้แจ้งเคลม</label>
              <div style={{
                padding: '10px 14px', background: 'var(--bg-app)',
                border: '1px solid var(--border)', borderRadius: '10px',
                fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600,
              }}>
                👤 {user?.full_name || '—'}
                <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  (จากบัญชีที่เข้าสู่ระบบ)
                </span>
              </div>
            </div>
            <Input
              label="โครงการ / งาน"
              required
              maxLength={100}
              placeholder="ระบุชื่อโครงการ..."
              value={formData.project_name}
              onChange={(e) => setFormData({...formData, project_name: e.target.value})}
            />
            <Select
              label="ระดับความสำคัญ"
              value={formData.priority}
              onChange={(e) => setFormData({...formData, priority: e.target.value})}
            >
              <option value="ปกติ">ปกติ</option>
              <option value="ด่วน">ด่วน</option>
            </Select>
            <Input
              label="วันที่และเวลาที่รับเครื่อง / เกิดปัญหา"
              type="datetime-local"
              required
              value={formData.received_at}
              onChange={(e) => setFormData({...formData, received_at: e.target.value})}
            />
          </FormSection>

          {/* ② สถานที่ / ด่าน */}
          <FormSection
            title="สถานที่ / ด่าน"
            subtitle="เลือกด่านก่อน เพื่อกรองรายการอุปกรณ์ที่ติดตั้งอยู่จริง"
            icon={<MapPin size={18} />}
          >
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                สถานที่ตั้งด่าน / จุดควบคุมน้ำหนักทางหลวง <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <StationSelector
                selectedStationId={formData.station_id}
                showArea={false}
                required={true}
                onChange={(data) => {
                  setFormData(prev => ({
                    ...prev,
                    station_id: data.stationId,
                    location: data.stationName,
                    instance_id: undefined,
                    inventory_id: undefined
                  }));
                }}
              />
            </div>
          </FormSection>

          {/* ③ อุปกรณ์ที่เคลมและเหตุผล */}
          <FormSection title="อุปกรณ์ที่เคลมและเหตุผล" icon={<ShieldAlert size={18} />}>
            <StationAssetPicker
              stationId={formData.station_id}
              selectedInstanceId={formData.instance_id}
              selectedInventoryId={formData.inventory_id}
              label="อุปกรณ์ที่ต้องการเคลม (เลือกจากคุรุภัณฑ์ที่ติดตั้งอยู่ในด่านนี้)"
              onSelect={(item: AssetLifecycleItem) => {
                setFormData(prev => ({
                  ...prev,
                  device_name: `${item.device_name}${item.model ? ' ' + item.model : ''}`,
                  instance_id: item.instance_id || undefined,
                  inventory_id: item.inventory_id
                }));
              }}
              onClear={() => {
                setFormData(prev => ({
                  ...prev,
                  device_name: '',
                  instance_id: undefined,
                  inventory_id: undefined
                }));
              }}
            />
            <Input
              label="ชื่ออุปกรณ์ / รุ่น (เพื่อการเคลม)"
              required
              maxLength={100}
              placeholder="ชื่ออุปกรณ์และ Serial Number"
              value={formData.device_name}
              onChange={(e) => setFormData({...formData, device_name: e.target.value})}
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <TextArea
                label="เหตุผลการเคลม / อาการเสีย"
                required
                rows={4}
                maxLength={1000}
                placeholder="ระบุรายละเอียดอาการที่ต้องการเคลม..."
                value={formData.problem}
                onChange={(e) => setFormData({...formData, problem: e.target.value})}
              />
            </div>
          </FormSection>

          {/* ④ หลักฐานการเคลม */}
          <FormSection
            title="หลักฐานการเคลม"
            subtitle="แนบรูปหลักฐานได้สูงสุด 4 รูป (JPG, PNG)"
            icon={<ImageIcon size={18} />}
            columns={1}
          >
            <div className="image-uploader-grid" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {images.map((image, index) => (
                <div key={index} className="image-preview-card">
                  <img src={URL.createObjectURL(image)} alt="preview" />
                  <button type="button" className="remove-btn" onClick={() => removeImage(index)} disabled={loading}>
                    <X size={16} />
                  </button>
                </div>
              ))}
              {images.length < 4 && (
                images.length === 0 ? (
                  <label className="image-uploader-box" style={{ width: '100%', height: '120px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, background: 'var(--bg-app)', border: '1px dashed var(--border)' }}>
                    <Upload size={24} style={{ marginBottom: '8px' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>คลิกเพื่อเลือกรูปภาพหลักฐานการเคลม</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>รองรับไฟล์ JPG, PNG (สูงสุด 4 รูป)</span>
                    <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} disabled={loading} />
                  </label>
                ) : (
                  <label className="image-uploader-box" style={{ width: '100px', height: '100px', padding: 0, cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--bg-app)', border: '1px dashed var(--border)' }}>
                    <Upload size={20} />
                    <span style={{ fontSize: '0.75rem', marginTop: '4px' }}>เพิ่มรูปภาพ</span>
                    <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} disabled={loading} />
                  </label>
                )
              )}
            </div>
          </FormSection>

          <div className="form-actions">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={loading}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={loading}>
              ส่งข้อมูลเคลม
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default NewClaim;
