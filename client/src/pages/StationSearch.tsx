import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { stationApi, repairApi, UPLOAD_URL, inventoryApi } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotification } from '../components/Layout';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import Card from '../components/ui/Card';
import Select from '../components/ui/Select';
import DatePicker from '../components/ui/DatePicker';
import StationSelector from '../components/ui/StationSelector';
import type { Station, InventoryTransaction, Repair } from '../types';
import ThailandMap from '../components/ui/ThailandMap';
import type { TableColumn, TableAction } from '../types/table.types';
import {
  MapPin,
  Tag,
  Plus,
  Trash2,
  Pencil,
  History as HistoryIcon,
  Info,
  Activity,
  Globe,
  Navigation,
  RefreshCw,
  Search,
  Map as MapIcon,
  Wrench,
  X,
  User,
  Calendar,
  TrendingUp,
  Package,
  Shield,
  QrCode
} from 'lucide-react';
import { provincesByRegion, getRegionFromProvince } from '../utils/thaiProvinces';
import { formatDateTimeThai } from '../utils/formatDate';

type StationFormData = {
  name: string;
  station_type: string;
  custom_type: string;
  highway_no: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH' | 'NONE';
  region: string;
  province: string;
  responsible_person: string;
  operational_start_date: string;
};

const EMPTY_FORM: StationFormData = {
  name: '', station_type: 'WEIGH_STATION', custom_type: '',
  highway_no: '', direction: 'INBOUND', region: '', province: '', responsible_person: '', operational_start_date: ''
};

const REGIONS = ['ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคกลาง', 'ภาคตะวันออก', 'ภาคตะวันตก', 'ภาคใต้'];
const STATION_TYPE_OPTIONS = [
  { value: 'WEIGH_STATION', label: 'สถานีตรวจสอบน้ำหนัก' },
  { value: 'CHECK_POINT', label: 'จุดตรวจน้ำหนัก (Check Point)' },
  { value: 'SPOT_CHECK', label: 'จุดสุ่มตรวจ (Spot Check)' },
  { value: 'REST_AREA', label: 'จุดจอดพักรถบรรทุก (Rest Area)' },
  { value: 'OTHER', label: 'อื่นๆ (ระบุเอง)' }
];
import StationQrLabels from '../components/StationQrLabels';
import BaseDataTable from '../components/tables/BaseDataTable';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { useAuth } from '../contexts/AuthContext';

type AssetStatusKey = 'normal' | 'pending' | 'in_progress' | 'waiting_parts' | 'claiming';

const ASSET_STATUS_META: Record<AssetStatusKey, { label: string; icon: string; color: string; bg: string }> = {
  normal: { label: 'ปกติ', icon: '✓', color: 'var(--success)', bg: 'var(--success-light)' },
  pending: { label: 'รอดำเนินการซ่อม', icon: '⏳', color: 'var(--warning)', bg: 'var(--warning-light)' },
  in_progress: { label: 'กำลังซ่อม', icon: '🔧', color: 'var(--info)', bg: 'var(--info-light)' },
  waiting_parts: { label: 'รออะไหล่', icon: '📦', color: 'var(--warning)', bg: 'var(--warning-light)' },
  claiming: { label: 'กำลังเคลม', icon: '🛡️', color: 'var(--danger)', bg: 'var(--danger-light)' },
};

// สภาพอุปกรณ์ (manual) — ตั้งได้เองต่อการ์ด แยกจาก badge งานซ่อมอัตโนมัติ
const CONDITION_OPTIONS = ['ปกติ', 'ชำรุด', 'ชำรุดรอเปลี่ยน', 'ปลดระวาง'] as const;

const CONDITION_META: Record<string, { icon: string; color: string; bg: string }> = {
  'ปกติ':          { icon: '✓', color: 'var(--success)', bg: 'var(--success-light)' },   // เขียว
  'ชำรุด':         { icon: '⚠', color: 'var(--warning)', bg: 'var(--warning-light)' },   // เหลือง
  'ชำรุดรอเปลี่ยน': { icon: '🔁', color: 'var(--warning)', bg: 'var(--warning-light)' },
  'ปลดระวาง':      { icon: '⊘', color: 'var(--danger)', bg: 'var(--danger-light)' },     // แดง
};

// สภาพรายชิ้นงาน (S/N) จากคลังพัสดุ
const INSTANCE_CONDITION_OPTIONS = ['New', 'Good', 'Fair', 'Broken'] as const;

const INSTANCE_CONDITION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  'New':    { label: 'ใหม่', color: 'var(--primary)', bg: 'var(--primary-light)', icon: '✨' },
  'Good':   { label: 'ดี', color: 'var(--success)', bg: 'var(--success-light)', icon: '✓' },
  'Fair':   { label: 'พอใช้', color: 'var(--warning)', bg: 'var(--warning-light)', icon: '⚠' },
  'Broken': { label: 'ชำรุด', color: 'var(--danger)', bg: 'var(--danger-light)', icon: '❌' }
};

const INSTANCE_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  'Under Repair': { label: 'ส่งซ่อม',   color: 'var(--warning)', bg: 'var(--warning-light)' },
  'Claiming':     { label: 'กำลังเคลม', color: 'var(--info)', bg: 'var(--info-light)' },
  'Damaged':      { label: 'เสียหาย',   color: 'var(--danger-on-tint)', bg: 'var(--danger-light)' },
  'In Stock':     { label: 'ในคลัง',    color: 'var(--text-muted)', bg: 'var(--bg-subtle)' },
};

interface DeployedInstance {
  id: number;
  serial_number: string;
  condition: string;
  status?: string;
  updated_at?: string;
  withdrawal_date?: string;
  project_name_snapshot?: string;
  contract_no_snapshot?: string;
  contract_year_snapshot?: number;
  source_withdrawal_id?: number;
}

interface ActiveAsset {
  id: number;
  name: string;
  model: string;
  quantity: number;
  image?: string;
  status: AssetStatusKey;
  activeTickets: Repair[];
  condition: string;
  conditionNote?: string;
  conditionBy?: string;
  conditionAt?: string;
  instances?: DeployedInstance[];
  latestWithdrawalDate?: string;
  latestWithdrawalId?: number;
  latestProject?: string;
  latestContract?: string;
  sourceCount?: number;
}

const StationSearch: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { hasPermission } = useAuth();
  const flatProvinceOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [{ label: '-- เลือกจังหวัด --', value: '' }];
    Object.entries(provincesByRegion).forEach(([regionName, provinces]) => {
      provinces.forEach(p => {
        opts.push({ label: `${p} (${regionName})`, value: p });
      });
    });
    return opts;
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const { urlState, setTableState } = useTableUrlState(20);
  const [now] = useState(() => Date.now());

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedStationId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : undefined;

  const [stations, setStations] = useState<Station[]>([]);
  const [activeRepairs, setActiveRepairs] = useState<Repair[]>([]);
  const [stationModal, setStationModal] = useState<{ open: boolean; mode: 'create' | 'edit'; station: Station | null }>({ open: false, mode: 'create', station: null });
  const [formData, setFormData] = useState<StationFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusKey | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [conditionDraft, setConditionDraft] = useState<{ status: string; note: string }>({ status: 'ปกติ', note: '' });
  const [savingCondition, setSavingCondition] = useState(false);
  const [verifyingStation, setVerifyingStation] = useState(false);
  const [moveAsset, setMoveAsset] = useState<{ inventoryId: number; instanceId?: number; name: string; quantity: number } | null>(null);
  const [moveTargetStationId, setMoveTargetStationId] = useState<number | undefined>(undefined);
  const [moveQuantity, setMoveQuantity] = useState(1);
  const [moveNote, setMoveNote] = useState('');
  const [movingAsset, setMovingAsset] = useState(false);

  // ลบ error เมื่อผู้ใช้แก้ค่า
  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // เปลี่ยนค่าฟอร์ม + ล้าง error ของฟิลด์นั้น
  const updateField = <K extends keyof StationFormData>(field: K, value: StationFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    clearFieldError(field as string);
  };

  // เปลี่ยนจังหวัด — อนุมานภาคให้ผู้ใช้ตรวจสอบ
  const handleProvinceChange = (province: string) => {
    setFormData(prev => {
      const derivedRegion = getRegionFromProvince(province);
      return {
        ...prev,
        province,
        region: derivedRegion || prev.region
      };
    });
    clearFieldError('province');
    if (getRegionFromProvince(province)) clearFieldError('region');
  };
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrStation, setQrStation] = useState<Station | null>(null);
  const [isMapOpen, setIsMapOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('station-map-open');
    return saved === null ? true : saved === '1';
  });
  const toggleMap = useCallback(() => {
    setIsMapOpen(prev => {
      const next = !prev;
      localStorage.setItem('station-map-open', next ? '1' : '0');
      return next;
    });
  }, []);

  const { data: details, loading: detailsLoading, request: fetchDetails } = useApi(stationApi.getDetails);

  const [updatingInstanceId, setUpdatingInstanceId] = useState<number | null>(null);

  const handleInstanceConditionChange = useCallback(async (instanceId: number, newCondition: string) => {
    if (!details?.station?.id) return;
    setUpdatingInstanceId(instanceId);
    try {
      await inventoryApi.updateInstanceCondition(instanceId, newCondition);
      notify('อัปเดตสภาพอุปกรณ์ย่อยสำเร็จ', 'success');
      await fetchDetails({ station_id: details.station.id });
    } catch {
      notify('อัปเดตสภาพอุปกรณ์ย่อยไม่สำเร็จ', 'error');
    } finally {
      setUpdatingInstanceId(null);
    }
  }, [details, fetchDetails, notify]);

  const loadInitialData = useCallback(async () => {
    try {
      const [stList, repList] = await Promise.all([
        stationApi.getUniqueList(),
        repairApi.getAll({})
      ]);
      setStations(stList);
      setActiveRepairs(repList.filter(r => r.status !== 'เสร็จสิ้น'));
    } catch {
      notify('ไม่สามารถโหลดข้อมูลเริ่มต้นได้', 'error');
    }
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInitialData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInitialData]);

  useEffect(() => {
    if (selectedStationId) {
      fetchDetails({ station_id: selectedStationId });
    }
  }, [selectedStationId, fetchDetails]);

  const openCreateModal = () => {
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setStationModal({ open: true, mode: 'create', station: null });
  };

  const openEditModal = (st: Station) => {
    const isStandardType = STATION_TYPE_OPTIONS.some(o => o.value === st.station_type && o.value !== 'OTHER');
    setFormData({
      name: st.name,
      station_type: isStandardType ? st.station_type : 'OTHER',
      custom_type: isStandardType ? '' : st.station_type,
      highway_no: st.highway_no,
      direction: st.direction,
      region: st.region,
      province: st.province,
      responsible_person: st.responsible_person || '',
      operational_start_date: st.operational_start_date || ''
    });
    setFieldErrors({});
    setStationModal({ open: true, mode: 'edit', station: st });
  };

  const closeStationModal = () => {
    setStationModal({ open: false, mode: 'create', station: null });
    setFieldErrors({});
  };

  const handleStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalType = formData.station_type === 'OTHER' ? formData.custom_type.trim() : formData.station_type;

    // === Field-level validation ===
    const errors: Record<string, string> = {};

    const nameTrim = formData.name.trim();
    if (!nameTrim) errors.name = 'กรุณากรอกชื่อสถานี';
    else if (nameTrim.length < 3) errors.name = 'ชื่อสถานีสั้นเกินไป (อย่างน้อย 3 ตัวอักษร)';
    else if (nameTrim.length > 100) errors.name = 'ชื่อสถานียาวเกินไป (ไม่เกิน 100 ตัวอักษร)';

    if (!formData.station_type) errors.station_type = 'กรุณาเลือกประเภทสถานี';
    else if (formData.station_type === 'OTHER' && !formData.custom_type.trim()) errors.custom_type = 'กรุณาระบุประเภทสถานี';

    const responsibleTrim = formData.responsible_person.trim();
    if (!responsibleTrim) errors.responsible_person = 'กรุณาระบุชื่อผู้รับผิดชอบสถานี';
    else if (responsibleTrim.length < 2) errors.responsible_person = 'ชื่อผู้รับผิดชอบสั้นเกินไป (อย่างน้อย 2 ตัวอักษร)';
    else if (responsibleTrim.length > 100) errors.responsible_person = 'ชื่อผู้รับผิดชอบยาวเกินไป (ไม่เกิน 100 ตัวอักษร)';

    if (!formData.province.trim()) errors.province = 'กรุณาเลือกจังหวัด';
    if (!formData.region) errors.region = 'กรุณาเลือกภูมิภาค';

    const highwayTrim = formData.highway_no.trim();
    if (!highwayTrim) errors.highway_no = 'กรุณาระบุเส้นทางหลวง';
    else if (highwayTrim.length > 20) errors.highway_no = 'เส้นทางหลวงยาวเกินไป';

    if (!formData.direction) errors.direction = 'กรุณาเลือกทิศทาง';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      notify('กรุณาตรวจสอบและกรอกข้อมูลให้ครบถ้วน', 'error');
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: nameTrim,
        station_type: finalType,
        highway_no: highwayTrim,
        direction: formData.direction,
        region: formData.region,
        province: formData.province.trim(),
        responsible_person: responsibleTrim,
        operational_start_date: formData.operational_start_date || undefined
      };

      if (stationModal.mode === 'edit' && stationModal.station) {
        await stationApi.update(stationModal.station.id, payload);
        notify('อัปเดตข้อมูลสถานีเรียบร้อยแล้ว');
      } else {
        await stationApi.create(payload);
        notify('เพิ่มสถานีใหม่เรียบร้อยแล้ว');
      }

      closeStationModal();
      loadInitialData();
      if (selectedStationId) fetchDetails({ station_id: selectedStationId });
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      notify(error.response?.data?.error || error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Enhanced Filtering Logic
  const filteredData = useMemo(() => {
    return (stations || []).filter(st => {
      // Text Search
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matchText = st.name.toLowerCase().includes(s) || 
                          st.code.toLowerCase().includes(s) || 
                          st.province.toLowerCase().includes(s);
        if (!matchText) return false;
      }

      // Region Filter
      if (urlState.filters.region && urlState.filters.region !== 'All') {
        if (st.region !== urlState.filters.region) return false;
      }
      
      // Province Filter
      if (urlState.filters.province && urlState.filters.province !== 'All') {
        if (st.province !== urlState.filters.province) return false;
      }

      // Type Filter
      if (urlState.filters.type && urlState.filters.type !== 'All') {
        if (st.station_type !== urlState.filters.type) return false;
      }

      return true;
    }).sort((a, b) => b.id - a.id);
  }, [stations, urlState.search, urlState.filters]);

  // Derived filter options (filtered by selected region dynamically)
  const provinces = useMemo(() => {
    let list = stations.map(s => s.province);
    if (urlState.filters.region && urlState.filters.region !== 'All') {
      const regionProvinces = provincesByRegion[urlState.filters.region] || [];
      list = list.filter(p => regionProvinces.includes(p));
    }
    return ['All', ...new Set(list)].sort();
  }, [stations, urlState.filters.region]);

  const stationCountsByRegion = useMemo(() => {
    const counts: Record<string, number> = {};
    stations.forEach(st => {
      if (st.region) {
        counts[st.region] = (counts[st.region] || 0) + 1;
      }
    });
    return counts;
  }, [stations]);

  const activeRepairsByRegion = useMemo(() => {
    const counts: Record<string, number> = {};
    activeRepairs.forEach(rep => {
      const st = stations.find(s => s.id === rep.station_id || (rep.station_name && s.name === rep.station_name));
      if (st && st.region) {
        counts[st.region] = (counts[st.region] || 0) + 1;
      }
    });
    return counts;
  }, [activeRepairs, stations]);

  const stationCountsByProvince = useMemo(() => {
    const counts: Record<string, number> = {};
    stations.forEach(st => {
      if (st.province) {
        counts[st.province] = (counts[st.province] || 0) + 1;
      }
    });
    return counts;
  }, [stations]);

  const activeRepairsByProvince = useMemo(() => {
    const counts: Record<string, number> = {};
    activeRepairs.forEach(rep => {
      const st = stations.find(s => s.id === rep.station_id || (rep.station_name && s.name === rep.station_name));
      if (st && st.province) {
        counts[st.province] = (counts[st.province] || 0) + 1;
      }
    });
    return counts;
  }, [activeRepairs, stations]);

  const stationTypes = [
    { label: 'ทั้งหมด', value: 'All' },
    { label: 'สถานีตรวจสอบน้ำหนัก', value: 'WEIGH_STATION' },
    { label: 'จุดตรวจน้ำหนัก (Check Point)', value: 'CHECK_POINT' },
    { label: 'จุดสุ่มตรวจ (Spot Check)', value: 'SPOT_CHECK' },
    { label: 'จุดจอดพักรถบรรทุก (Rest Area)', value: 'REST_AREA' }
  ];

  const handleDeleteStation = async (st: Station) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบสถานี',
      message: `คุณแน่ใจหรือไม่ว่าต้องการลบสถานี "${st.name}"? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        await stationApi.delete(st.id);
        notify('ลบสถานีสำเร็จ', 'success');
        loadInitialData();
      } catch (err) {
        const error = err as Error;
        notify(error.message || 'ไม่สามารถลบสถานีได้', 'error');
      }
    }
  };

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const formatRelativeTime = (iso: string): string => {
    const diff = now - new Date(iso).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'วันนี้';
    if (days === 1) return 'เมื่อวาน';
    if (days < 7) return `${days} วันที่แล้ว`;
    if (days < 30) return `${Math.floor(days / 7)} สัปดาห์ก่อน`;
    if (days < 365) return `${Math.floor(days / 30)} เดือนก่อน`;
    return `${Math.floor(days / 365)} ปีก่อน`;
  };

  // Filter data by selected date range
  const filteredDetails = useMemo(() => {
    if (!details) return null;
    if (dateRange === 'all') {
      return {
        repairs: details.repairs || [],
        claims: details.claims || [],
        withdrawals: details.withdrawals || [],
        transactions: details.transactions || []
      };
    }
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const inRange = (iso: string) => new Date(iso).getTime() >= cutoff;
    return {
      repairs: (details.repairs || []).filter(r => inRange(r.created_at)),
      claims: (details.claims || []).filter(c => inRange(c.created_at)),
      withdrawals: (details.withdrawals || []).filter(w => inRange(w.created_at)),
      transactions: (details.transactions || []).filter(t => inRange(t.created_at))
    };
  }, [details, dateRange, now]);

  // Top 3 most broken devices in this station (within date range)
  const topBrokenDevices = useMemo(() => {
    if (!filteredDetails) return [];
    const counter = new Map<string, number>();
    filteredDetails.repairs.forEach(r => {
      if (r.device_name) counter.set(r.device_name, (counter.get(r.device_name) || 0) + 1);
    });
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [filteredDetails]);

  const activeAssets = useMemo(() => {
    if (!details || !details.withdrawals) return [];
    const assetsMap = new Map<number, ActiveAsset>();
    if (details.assets && details.assets.length > 0) {
      details.assets.forEach(asset => {
        const latestLot = asset.source_lots?.[0];
        assetsMap.set(asset.inventory_id, {
          id: asset.inventory_id,
          name: asset.device_name || 'ไม่ระบุชื่อพัสดุ',
          model: asset.model || '—',
          quantity: Number(asset.current_quantity) || 0,
          image: asset.image_path,
          status: 'normal',
          activeTickets: [],
          condition: 'ปกติ',
          latestWithdrawalDate: latestLot?.withdrawal_date,
          latestWithdrawalId: latestLot?.withdrawal_id,
          latestProject: latestLot?.project_name_snapshot || undefined,
          latestContract: latestLot?.contract_no_snapshot
            ? `${latestLot.contract_no_snapshot}${latestLot.contract_year_snapshot ? ` (ปี ${latestLot.contract_year_snapshot})` : ''}`
            : 'ไม่ระบุสัญญา',
          sourceCount: asset.source_lots?.length || 0,
        });
      });
    } else {
      details.withdrawals.forEach(w => {
        if (w.items) {
          w.items.forEach(item => {
            const invId = item.inventory_id;
            const existing = assetsMap.get(invId);
            if (existing) {
              existing.quantity += item.quantity;
            } else {
              assetsMap.set(invId, {
                id: invId,
                name: item.item_name || 'ไม่ระบุชื่อพัสดุ',
                model: item.item_model || '—',
                quantity: item.quantity,
                image: item.item_image,
                status: 'normal',
                activeTickets: [],
                condition: 'ปกติ'
              });
            }
          });
        }
      });
    }

    const activeTickets = [...(details.repairs || []), ...(details.claims || [])]
      .filter(r => r.status !== 'เสร็จสิ้น');

    assetsMap.forEach(asset => {
      const sourceWithdrawals = (details.withdrawals || [])
        .filter(w => (w.items || []).some(item => item.inventory_id === asset.id))
        .sort((a, b) => new Date(b.withdrawal_date || b.created_at).getTime() - new Date(a.withdrawal_date || a.created_at).getTime());
      const latestSource = sourceWithdrawals[0];
      const sourceLots = details.assets?.find(item => item.inventory_id === asset.id)?.source_lots || [];
      if (sourceLots.length === 0 && latestSource) {
        asset.latestWithdrawalDate = latestSource.withdrawal_date || latestSource.created_at;
        asset.latestWithdrawalId = latestSource.id;
        asset.latestProject = latestSource.project_name || 'ไม่ระบุโครงการ';
        asset.latestContract = latestSource.contract_no
          ? `${latestSource.contract_no}${latestSource.contract_year ? ` (ปี ${latestSource.contract_year})` : ''}`
          : latestSource.contract_reference_type === 'none'
            ? 'ไม่มีสัญญา'
            : 'ไม่ระบุสัญญา';
        asset.sourceCount = new Set(sourceWithdrawals.map(w => `${w.contract_id || w.contract_reference_type || 'none'}-${w.project_name || ''}`)).size;
      }
      const tickets = activeTickets.filter(r =>
        r.inventory_id != null
          ? r.inventory_id === asset.id
          : (r.device_name.toLowerCase().includes(asset.name.toLowerCase()) || asset.name.toLowerCase().includes(r.device_name.toLowerCase()))
      );
      asset.activeTickets = tickets;
      if (tickets.length > 0) {
        const hasClaim = tickets.some(t => t.type === 'claim');
        const hasWaitingParts = tickets.some(t => t.status === 'รออะไหล่');
        const hasInProgress = tickets.some(t => t.status === 'กำลังซ่อม');
        if (hasClaim) asset.status = 'claiming';
        else if (hasWaitingParts) asset.status = 'waiting_parts';
        else if (hasInProgress) asset.status = 'in_progress';
        else asset.status = 'pending';
      }
    });

    // ผสานสภาพอุปกรณ์ (manual) ตาม inventory_id
    (details.asset_statuses || []).forEach(s => {
      const asset = assetsMap.get(s.inventory_id);
      if (asset) {
        asset.condition = s.status || 'ปกติ';
        asset.conditionNote = s.note;
        asset.conditionBy = s.updated_by;
        asset.conditionAt = s.updated_at;
      }
    });

    // ผสานรายการชิ้นงานที่มี Serial Number (instances)
    if (details.instances) {
      details.instances.forEach(inst => {
        const asset = assetsMap.get(inst.inventory_id);
        if (asset) {
          if (!asset.instances) {
            asset.instances = [];
          }
          asset.instances.push({
            id: inst.id,
            serial_number: inst.serial_number,
            condition: inst.condition || 'New',
            status: inst.status || 'Withdrawn',
            updated_at: inst.updated_at,
            withdrawal_date: inst.withdrawal_date,
            project_name_snapshot: inst.project_name_snapshot,
            contract_no_snapshot: inst.contract_no_snapshot,
            contract_year_snapshot: inst.contract_year_snapshot,
            source_withdrawal_id: inst.source_withdrawal_id
          });
        }
      });
    }

    return Array.from(assetsMap.values());
  }, [details]);

  const assetStatusCounts = useMemo(() => {
    const counts: Record<AssetStatusKey, number> = { normal: 0, pending: 0, in_progress: 0, waiting_parts: 0, claiming: 0 };
    activeAssets.forEach(asset => { counts[asset.status]++; });
    return counts;
  }, [activeAssets]);

  const visibleAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    return activeAssets.filter(asset => {
      if (assetStatusFilter && asset.status !== assetStatusFilter) return false;
      if (!q) return true;
      const instanceText = (asset.instances || []).map(instance => [instance.serial_number, instance.contract_no_snapshot, instance.project_name_snapshot].filter(Boolean).join(' ')).join(' ');
      return [asset.name, asset.model, asset.latestProject, asset.latestContract, instanceText].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [activeAssets, assetStatusFilter, assetSearch]);

  // เปิด/ปิดการ์ด + เซ็ตค่าตั้งต้นของ editor สภาพอุปกรณ์
  const toggleAsset = useCallback((asset: ActiveAsset) => {
    setExpandedAssetId(prev => {
      if (prev === asset.id) return null;
      setConditionDraft({ status: asset.condition || 'ปกติ', note: asset.conditionNote || '' });
      return asset.id;
    });
  }, []);

  // บันทึกสภาพอุปกรณ์ (manual) แล้วรีเฟรชรายละเอียดสถานี
  const saveCondition = useCallback(async (asset: ActiveAsset) => {
    if (!details?.station?.id) return;
    setSavingCondition(true);
    try {
      await stationApi.setAssetStatus(details.station.id, asset.id, {
        status: conditionDraft.status,
        note: conditionDraft.note,
      });
      notify('บันทึกสภาพอุปกรณ์เรียบร้อยแล้ว', 'success');
      await fetchDetails({ station_id: details.station.id });
    } catch {
      notify('บันทึกสภาพอุปกรณ์ไม่สำเร็จ', 'error');
    } finally {
      setSavingCondition(false);
    }
  }, [details, conditionDraft, notify, fetchDetails]);

  const submitMoveAsset = useCallback(async () => {
    if (!details?.station?.id || !moveAsset || !moveTargetStationId) {
      notify('กรุณาเลือกสถานีปลายทาง', 'error');
      return;
    }
    setMovingAsset(true);
    try {
      await stationApi.moveAsset(details.station.id, {
        inventory_id: moveAsset.inventoryId,
        instance_id: moveAsset.instanceId,
        quantity: moveAsset.instanceId ? 1 : moveQuantity,
        to_station_id: moveTargetStationId,
        note: moveNote.trim() || undefined,
      });
      notify('ย้ายอุปกรณ์เรียบร้อยแล้ว', 'success');
      setMoveAsset(null);
      setMoveTargetStationId(undefined);
      setMoveQuantity(1);
      setMoveNote('');
      await fetchDetails({ station_id: details.station.id });
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      notify(error.response?.data?.error || 'ย้ายอุปกรณ์ไม่สำเร็จ', 'error');
    } finally {
      setMovingAsset(false);
    }
  }, [details, moveAsset, moveTargetStationId, moveQuantity, moveNote, notify, fetchDetails]);

  const columns: TableColumn<Station>[] = [
    { 
      id: 'code', header: 'รหัสสถานี', accessor: 'code', priority: 1, width: '150px',
      render: (val) => <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-light)', padding: '6px 12px', borderRadius: '8px' }}><Tag size={14} />{val}</div>
    },
    { 
      id: 'name', header: 'ชื่อสถานี / จุดตรวจ', accessor: 'name', priority: 1, width: 'auto',
      render: (val) => <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}><MapPin size={16} color="var(--danger)" />{val}</div>
    },
    { 
      id: 'province', header: 'จังหวัด', accessor: 'province', priority: 2, width: '110px',
      render: (val) => <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-muted)' }}><Globe size={14} />{val}</div>
    },
    {
      id: 'type', header: 'ประเภทสถานี', accessor: 'station_type', priority: 1, width: '160px',
      render: (val) => {
        const typeLabel = stationTypes.find(t => t.value === val)?.label || val;
        return <span className="badge glass-card" style={{ border: '1px solid var(--primary-light)', color: 'var(--primary)', fontWeight: 800 }}>{typeLabel}</span>;
      }
    },
    {
      id: 'responsible', header: 'ผู้รับผิดชอบ', accessor: 'responsible_person', priority: 2, width: '140px',
      render: (val) => {
        if (val && String(val).trim() !== '') {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={13} />
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(val)}>{val}</span>
            </div>
          );
        }
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', background: 'var(--danger-light)', color: 'var(--danger)',
            borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800
          }} title="กรุณากดแก้ไขเพื่อระบุผู้รับผิดชอบ">
            ⚠ ยังไม่ระบุ
          </span>
        );
      }
    },
    { id: 'status', header: 'สถานะระบบ', accessor: () => 'ปกติ', priority: 1, width: '100px', align: 'center', render: () => <span className="badge badge-success" style={{ width: '80px', textAlign: 'center', fontWeight: 800 }}>พร้อมใช้งาน</span> }
  ];

  const actions: TableAction<Station>[] = [
    { id: 'view', label: 'เจาะลึกข้อมูล', icon: <HistoryIcon size={14} />, onClick: (st) => navigate(`/stations?id=${st.id}&q=${encodeURIComponent(st.name)}`) },
    { id: 'edit', label: 'แก้ไขข้อมูล', icon: <Pencil size={14} />, onClick: openEditModal, hidden: () => !hasPermission('manage.stations') },
    { id: 'delete', label: 'ลบทิ้ง', icon: <Trash2 size={14} />, variant: 'danger', onClick: handleDeleteStation, hidden: () => !hasPermission('delete.stations') }
  ];

  const renderDetailDrawer = useCallback((st: Station) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem' }}>
      <div className="glass-card" style={{ padding: '2rem', borderRadius: '24px', display: 'flex', gap: '1.5rem', alignItems: 'center', background: 'linear-gradient(135deg, var(--primary-light), transparent)' }}>
        <div style={{ background: 'white', padding: '16px', borderRadius: '18px', color: 'var(--danger)', boxShadow: 'var(--elevation-2)' }}><MapPin size={40} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '4px' }}>ข้อมูลสรุปของสถานี</div>
          <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{st.name}</h3>
          <p style={{ margin: '4px 0 6px', color: 'var(--text-muted)', fontWeight: 700 }}>รหัสประจำสถานี: {st.code}</p>
          {st.created_at && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-subtle)', padding: '3px 10px', borderRadius: '6px' }}>
              <Calendar size={12} /> สร้างเมื่อ {formatDateTimeThai(st.created_at)}
            </div>
          )}
        </div>
      </div>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 800 }}>
          <Info size={20} color="var(--primary)" /> รายละเอียดเชิงเทคนิค
        </h4>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Globe size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600 }}>จังหวัด / ภูมิภาค</span>
            </div>
            <span style={{ fontWeight: 800 }}>{st.province} ({st.region})</span>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Navigation size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600 }}>เส้นทางทางหลวง / ทิศทาง</span>
            </div>
            <span style={{ fontWeight: 800 }}>ทล.{st.highway_no} ({st.direction})</span>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Activity size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600 }}>รูปแบบสถานี</span>
            </div>
            <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{st.station_type}</span>
          </div>
          {/* ผู้รับผิดชอบ */}
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <User size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600 }}>ผู้รับผิดชอบสถานี</span>
            </div>
            {st.responsible_person && st.responsible_person.trim() !== '' ? (
              <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>{st.responsible_person}</span>
            ) : (
              <span style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '0.85rem' }}>⚠ ยังไม่ระบุ</span>
            )}
          </div>
          {/* เปิดใช้งานเมื่อ */}
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Calendar size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600 }}>เปิดใช้งานเมื่อ</span>
            </div>
            <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.92rem' }}>
              {st.created_at ? formatDateTimeThai(st.created_at) : '— ไม่ระบุ —'}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 800 }}>
          <HistoryIcon size={20} color="var(--primary)" /> สถิติย้อนหลัง (Snapshot)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
           <Card className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px' }}>เคสซ่อมสะสม</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>0</div>
           </Card>
           <Card className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px' }}>ยอดเบิกพัสดุ</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>0</div>
           </Card>
        </div>
      </section>

      <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', gap: '1rem' }}>
        <Button 
          variant="primary" 
          style={{ flex: 1, padding: '16px', borderRadius: '16px', fontSize: '1rem' }} 
          onClick={() => navigate(`/stations?id=${st.id}&q=${encodeURIComponent(st.name)}`)} 
          icon={<HistoryIcon size={20} />}
        >
          เปิดแฟ้มข้อมูล 360 องศา
        </Button>
      </div>
    </div>
  ), [navigate]);

  return (
    <div className="station-page" style={{ padding: 'var(--main-padding)', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      {!selectedStationId ? (
        <>
          <BackButton />
          <div className="page-header" style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '6px' }}>
                <MapIcon size={20} />
                <span style={{ fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Asset Location Hub</span>
              </div>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>บริหารจัดการสถานีและจุดตรวจ</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '1.05rem', fontWeight: 500 }}>
                สืบค้นข้อมูลพัสดุและประวัติการซ่อมบำรุงรายสถานีทั่วประเทศ
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
               <button className="btn btn-outline" onClick={toggleMap} title={isMapOpen ? 'ซ่อนแผนที่' : 'แสดงแผนที่'}>
                 <MapIcon size={20} /> {isMapOpen ? 'ซ่อนแผนที่' : 'แสดงแผนที่'}
               </button>
               <button className="btn btn-outline" onClick={loadInitialData} title="รีเฟรชข้อมูล"><RefreshCw size={20} /></button>
               {hasPermission('manage.stations') && (
                 <button className="btn btn-primary" onClick={openCreateModal}><Plus size={20} /> เพิ่มสถานีใหม่</button>
               )}
            </div>
          </div>

          <div className={`station-layout ${isMapOpen ? 'map-open' : 'map-closed'}`} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', alignItems: 'start', width: '100%' }}>
            <style>{`
              @media (min-width: 1280px) {
                .station-layout.map-open {
                  grid-template-columns: 300px 1fr !important;
                }
              }
            `}</style>

            {/* Left Column: Thailand Map Widget (collapsible) */}
            {isMapOpen ? (
            <Card className="glass-card" style={{ padding: '1.5rem', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', position: 'sticky', top: '1rem' }}>
              <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>แผนที่ภูมิภาค</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>คลิกเลือกภาคเพื่อกรองข้อมูลด่าน</p>
                </div>
                <button
                  onClick={toggleMap}
                  title="ซ่อนแผนที่"
                  aria-label="ซ่อนแผนที่"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <ThailandMap
                selectedRegion={urlState.filters.region}
                onSelectRegion={(region) => {
                  const currentRegion = urlState.filters.region;
                  const nextRegion = currentRegion === region ? 'All' : region;
                  setTableState({
                    filters: {
                      ...urlState.filters,
                      region: nextRegion,
                      province: 'All' // Reset province when changing region
                    },
                    page: 1
                  });
                }}
                stationCountsByRegion={stationCountsByRegion}
                activeRepairsByRegion={activeRepairsByRegion}
                stationCountsByProvince={stationCountsByProvince}
                activeRepairsByProvince={activeRepairsByProvince}
              />
              
              {urlState.filters.region && urlState.filters.region !== 'All' && (
                <button 
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', borderRadius: '10px', fontSize: '0.78rem', padding: '6px 12px', border: '1px solid var(--primary-border)', color: 'var(--primary)', background: 'var(--primary-light)', fontWeight: 800 }}
                  onClick={() => setTableState({ filters: { ...urlState.filters, region: 'All', province: 'All' }, page: 1 })}
                >
                  ล้างการเลือกภูมิภาค
                </button>
              )}
            </Card>
            ) : null}

            {/* Right Column: Search + Filters + Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
              <Card className="glass-card" style={{ padding: '1.5rem', borderRadius: '20px', overflow: 'visible', zIndex: 30 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'flex-end' }} className="filters-grid">
                  <style>{`
                    @media (min-width: 1200px) {
                      .filters-grid {
                        grid-template-columns: 2fr 1fr 1fr 100px !important;
                      }
                    }
                  `}</style>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>ค้นหาอัจฉริยะ</label>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input 
                        className="form-control" 
                        style={{ paddingLeft: '44px', height: '48px', borderRadius: '12px' }} 
                        placeholder="ชื่อสถานี, รหัสย่อ, หรือจังหวัด..."
                        value={urlState.search}
                        onChange={(e) => setTableState({ search: e.target.value, page: 1 })}
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>กรองตามจังหวัด</label>
                    <Select
                      value={urlState.filters.province || 'All'}
                      options={provinces.map(p => ({ label: p === 'All' ? 'ทุกจังหวัด' : p, value: p }))}
                      onChange={(val) => setTableState({ filters: { ...urlState.filters, province: String(val) }, page: 1 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>ประเภทสถานี</label>
                    <Select
                      value={urlState.filters.type || 'All'}
                      options={stationTypes.map(t => ({ label: t.label, value: t.value }))}
                      onChange={(val) => setTableState({ filters: { ...urlState.filters, type: String(val) }, page: 1 })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <button 
                    className="btn btn-outline" 
                    style={{ height: '48px', borderRadius: '12px', width: '100%' }}
                    onClick={() => setTableState({ search: '', page: 1, filters: {} })}
                  >
                    ล้าง
                  </button>
                </div>
              </Card>

              <BaseDataTable
                columns={columns}
                data={paginatedData}
                state={{ loading: false, error: null, empty: paginatedData.length === 0 }}
                totalCount={stations.length}
                emptyState={{
                  noData: { message: 'ยังไม่มีสถานีในระบบ', hint: 'กด "เพิ่มสถานีใหม่" เพื่อสร้างสถานีแรก' },
                  noResults: { message: 'ไม่พบสถานีที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
                }}
                actions={actions}
                onRowClick={(st) => navigate(`/stations?id=${st.id}&q=${encodeURIComponent(st.name)}`)}
                drawerTitle={(st) => st.name}
                renderDetailDrawer={renderDetailDrawer}
                mobileConfig={{ title: (s) => s.name, subtitle: (s) => s.code, statusBadge: () => <span className="badge badge-success">ปกติ</span> }}
              />
              <TablePagination config={{ page: urlState.page, pageSize: urlState.pageSize, totalItems: filteredData.length }} onPageChange={(p) => setTableState({ page: p })} onPageSizeChange={(s) => setTableState({ pageSize: s, page: 1 })} />
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
           <BackButton to="/stations" label="ย้อนกลับไปรายชื่อสถานี" />

           {detailsLoading && (
             <div style={{ textAlign: 'center', padding: '5rem' }}>
                <div className="spinner" style={{ margin: '0 auto 1.5rem auto', width: 48, height: 48, borderWidth: '5px' }}></div>
                <h3 style={{ fontWeight: 800, color: 'var(--text-muted)' }}>กำลังดึงข้อมูลแฟ้มประวัติสถานี...</h3>
             </div>
           )}

           {details && filteredDetails && !detailsLoading && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* === STATION DOSSIER HEADER === */}
                <div style={{
                  position: 'relative',
                  borderRadius: '22px',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #081426 0%, #123a72 55%, #081426 100%)',
                  boxShadow: '0 18px 40px -20px rgba(15, 23, 42, 0.45)',
                }}>
                  {/* Grid overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                    pointerEvents: 'none',
                  }} />
                  {/* Gradient beam */}
                  <div style={{
                    position: 'absolute', top: '-30%', right: '-10%',
                    width: '60%', height: '180%',
                    background: 'radial-gradient(ellipse at center, rgba(96, 165, 250, 0.22), transparent 65%)',
                    pointerEvents: 'none',
                  }} />

                  <div style={{ position: 'relative', padding: '1.75rem 2.25rem 1.5rem' }}>
                    {/* Live tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
                      <span style={{
                        position: 'relative',
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--primary)',
                        boxShadow: '0 0 0 0 rgba(96, 165, 250, 0.65)',
                        animation: 'station-pulse 2s infinite',
                      }} />
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 800,
                        letterSpacing: '0.22em', textTransform: 'uppercase',
                        color: 'var(--primary)',
                       }}>แฟ้มข้อมูลสถานี</span>
                      <span style={{
                        height: '12px', width: '1px',
                        background: 'rgba(255,255,255,0.18)',
                      }} />
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        color: '#94a3b8',
                        fontFamily: 'var(--font-ui)',
                      }}>// ตรวจวัดสถานะสด</span>
                    </div>

                    {/* Code + Name & Actions Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                      <div style={{ flex: 1, minWidth: '285px' }}>
                        <div style={{
                          fontFamily: 'var(--font-ui)',
                          fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 700,
                          letterSpacing: '0.1em', marginBottom: '6px',
                        }}>
                          {details.station.code}
                        </div>
                        <h1 style={{
                          margin: 0, color: 'white',
                          fontSize: 'clamp(1.7rem, 3.6vw, 2.55rem)',
                          fontWeight: 800, lineHeight: 1.05,
                          letterSpacing: '-0.03em',
                        }}>
                          {details.station.name}
                        </h1>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={() => navigate(`/new?station_id=${details.station.id}`)}
                          style={{ borderRadius: '10px', fontSize: '0.75rem', padding: '8px 16px', color: '#0f172a', fontWeight: 800 }}
                        >
                          <Plus size={12} /> แจ้งซ่อมด่วน
                        </button>
                        <button 
                          className="btn btn-outline btn-sm" 
                          onClick={() => navigate(`/withdrawal?station_id=${details.station.id}`)}
                          style={{ borderRadius: '10px', fontSize: '0.75rem', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontWeight: 800 }}
                        >
                          <Plus size={12} /> เบิกพัสดุลงด่าน
                        </button>
                        <button 
                          type="button"
                          className="btn btn-outline btn-sm" 
                          onClick={() => {
                            setQrStation(details.station);
                            setQrModalOpen(true);
                          }}
                          style={{ borderRadius: '10px', fontSize: '0.75rem', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontWeight: 800 }}
                        >
                          <QrCode size={12} style={{ marginRight: '4px' }} /> คิวอาร์โค้ด
                        </button>
                        {hasPermission('manage.stations') && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={verifyingStation}
                            onClick={async () => {
                              setVerifyingStation(true);
                              try {
                                await stationApi.verify(details.station.id);
                                notify('บันทึกการตรวจสอบสถานีเรียบร้อยแล้ว', 'success');
                                await fetchDetails({ station_id: details.station.id });
                              } catch {
                                notify('บันทึกการตรวจสอบสถานีไม่สำเร็จ', 'error');
                              } finally {
                                setVerifyingStation(false);
                              }
                            }}
                            style={{ borderRadius: '10px', fontSize: '0.75rem', padding: '8px 16px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontWeight: 800, opacity: verifyingStation ? 0.6 : 1 }}
                          >
                            {verifyingStation ? 'กำลังบันทึก...' : '✓ ตรวจสอบสถานีแล้ว'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata pills */}
                    <div style={{ marginTop: '14px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'จังหวัด', value: details.station.province },
                        { label: 'ทางหลวง', value: `ทล.${details.station.highway_no}` },
                        { label: 'ทิศทาง', value: details.station.direction },
                      ].map((tag, i) => (
                        <div key={i} style={{
                          display: 'inline-flex', alignItems: 'baseline', gap: '8px',
                          padding: '5px 12px',
                          borderRadius: '7px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: '0.74rem',
                        }}>
                          <span style={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>{tag.label}</span>
                          <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{tag.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.68rem', color: '#cbd5e1' }}>
                      <span>สร้างข้อมูล: {details.station.created_at ? formatDateTimeThai(details.station.created_at) : 'ไม่ระบุ'}</span>
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>•</span>
                      <span>เริ่มใช้งาน: {details.station.operational_start_date ? new Date(`${details.station.operational_start_date}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'ยังไม่ระบุ'}</span>
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>•</span>
                      <span>ตรวจสอบล่าสุด: {details.station.last_verified_at ? formatDateTimeThai(details.station.last_verified_at) : 'ยังไม่ตรวจสอบ'}</span>
                    </div>

                    {/* Time window segmented control */}
                    <div style={{
                      marginTop: '1.5rem', paddingTop: '1.25rem',
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                    }}>
                      <span style={{
                        fontSize: '0.6rem', fontWeight: 800,
                        color: '#94a3b8',
                        letterSpacing: '0.2em', textTransform: 'uppercase',
                        fontFamily: 'var(--font-ui)',
                      }}>ช่วงเวลา ▸</span>
                      <div style={{
                        display: 'flex', gap: '3px',
                        background: 'rgba(0,0,0,0.35)',
                        padding: '3px',
                        borderRadius: '9px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {([
                          { val: '7d', label: '7 วัน' },
                          { val: '30d', label: '30 วัน' },
                          { val: '90d', label: '90 วัน' },
                          { val: 'all', label: 'ทั้งหมด' }
                        ] as const).map(opt => {
                          const active = dateRange === opt.val;
                          return (
                            <button
                              key={opt.val}
                              onClick={() => setDateRange(opt.val)}
                              style={{
                                padding: '6px 16px',
                                borderRadius: '7px',
                                border: 'none',
                                background: active ? 'var(--primary)' : 'transparent',
                                color: active ? '#0f172a' : '#cbd5e1',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                minWidth: '62px',
                                boxShadow: active ? '0 4px 14px -4px rgba(41, 182, 246, 0.6)' : 'none',
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* === UNIFIED TELEMETRY STRIP — Activity + Counters + Top Broken === */}
                {(() => {
                   const nowVal = now;
                   const oneDay = 24 * 60 * 60 * 1000;
                   const buckets = Array.from({ length: 7 }, () => 0);
                   const dayLabels: string[] = [];
                   for (let i = 6; i >= 0; i--) {
                     const d = new Date(nowVal - i * oneDay);
                     dayLabels.push(d.toLocaleDateString('th-TH', { weekday: 'narrow' }));
                   }
                   filteredDetails.transactions.forEach((tx: InventoryTransaction) => {
                     const t = new Date(tx.created_at).getTime();
                     const diffDays = Math.floor((nowVal - t) / oneDay);
                     if (diffDays >= 0 && diffDays < 7) buckets[6 - diffDays] += 1;
                   });
                  const maxBucket = Math.max(1, ...buckets);
                  const totalActivity = filteredDetails.transactions.length;
                  const sparklinePoints = buckets.map((v, i) => {
                    const x = (i / 6) * 280;
                    const y = 60 - (v / maxBucket) * 55;
                    return `${x},${y}`;
                  }).join(' ');
                  const lastBucket = buckets[6];
                  const prevBucket = buckets[5];
                  const dailyDelta = lastBucket - prevBucket;

                  const counters = [
                    { label: 'งานซ่อม', val: filteredDetails.repairs.length, color: 'var(--primary)', unit: 'ครั้ง', icon: <Wrench size={20} /> },
                    { label: 'งานเคลม', val: filteredDetails.claims.length, color: 'var(--warning)', unit: 'ครั้ง', icon: <Shield size={20} /> },
                    { label: 'การเบิก', val: filteredDetails.withdrawals.length, color: 'var(--success)', unit: 'รายการ', icon: <Package size={20} /> },
                  ];

                  return (
                    <div style={{
                      position: 'relative',
                      borderRadius: '20px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      boxShadow: '0 4px 24px -8px rgba(15, 23, 42, 0.08)',
                    }}>
                      {/* Section label strip */}
                      <div style={{
                        padding: '12px 22px',
                        background: 'linear-gradient(90deg, var(--bg-app), transparent)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Activity size={13} color="var(--primary)" />
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 800,
                            letterSpacing: '0.22em', textTransform: 'uppercase',
                            color: 'var(--text-main)',
                          }}>ภาพรวมสถิติสถานี</span>
                        </div>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: 700,
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-ui)',
                          letterSpacing: '0.08em',
                        }}>
                          {dateRange === 'all' ? 'ข้อมูลทั้งหมด' : dateRange === '7d' ? '7 วันล่าสุด' : dateRange === '30d' ? '30 วันล่าสุด' : '90 วันล่าสุด'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.3fr' }}>
                        {/* Cell 1: Activity sparkline */}
                        <div style={{
                          padding: '1.5rem 1.5rem',
                          borderRight: '1px solid var(--border)',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          textAlign: 'center',
                        }}>
                          {/* Icon container */}
                          <div style={{
                            width: '42px', height: '42px',
                            borderRadius: '50%',
                            background: 'rgba(96, 165, 250, 0.13)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--primary)',
                            marginBottom: '4px',
                          }}>
                            <Activity size={20} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}>
                            <span style={{
                              fontSize: '0.62rem', fontWeight: 800,
                              color: 'var(--text-muted)',
                              letterSpacing: '0.16em', textTransform: 'uppercase',
                            }}>ความเคลื่อนไหวรวม</span>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              padding: '2px 7px', borderRadius: '5px',
                              background: dailyDelta >= 0 ? 'var(--success-light)' : 'var(--danger-light)',
                              color: dailyDelta >= 0 ? 'var(--success)' : 'var(--danger)',
                              fontSize: '0.62rem', fontWeight: 800,
                            }}>
                              <TrendingUp size={9} style={dailyDelta < 0 ? { transform: 'scaleY(-1)' } : undefined} />
                              {dailyDelta >= 0 ? '+' : ''}{dailyDelta}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 'clamp(2.6rem, 4.5vw, 3.6rem)',
                            fontWeight: 900, lineHeight: 0.9,
                            letterSpacing: '-0.04em',
                            color: 'var(--text-main)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>{totalActivity}</div>
                          <svg viewBox="0 0 280 60" width="100%" height="46" preserveAspectRatio="none" style={{ display: 'block', marginTop: '4px' }}>
                            <defs>
                              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <polygon points={`0,60 ${sparklinePoints} 280,60`} fill="url(#sparkGrad)" />
                            <polyline points={sparklinePoints} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                            {buckets.map((v, i) => {
                              const x = (i / 6) * 280;
                              const y = 60 - (v / maxBucket) * 55;
                              return <circle key={i} cx={x} cy={y} r={i === 6 ? 3.5 : 2} fill="var(--primary)" />;
                            })}
                          </svg>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-ui)', width: '100%' }}>
                            {dayLabels.map((d, i) => <span key={i}>{d}</span>)}
                          </div>
                        </div>

                        {/* Cells 2-4: Counters */}
                        {counters.map((k, i) => (
                          <div key={i} style={{
                            padding: '1.5rem 1.25rem',
                            borderRight: '1px solid var(--border)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            textAlign: 'center',
                          }}>
                            {/* Top accent stripe */}
                            <div style={{
                              position: 'absolute', top: 0, left: 0, right: 0,
                              height: '2px', background: k.color, opacity: 0.7,
                            }} />
                            {/* Icon container */}
                            <div style={{
                              width: '42px', height: '42px',
                              borderRadius: '50%',
                              background: `${k.color}15`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: k.color,
                              marginBottom: '10px'
                            }}>
                              {k.icon}
                            </div>
                            <div>
                              <div style={{
                                fontSize: '0.62rem', fontWeight: 800,
                                color: 'var(--text-muted)',
                                letterSpacing: '0.16em', textTransform: 'uppercase',
                              }}>{k.label}</div>
                              <div style={{
                                fontSize: 'clamp(2.4rem, 4vw, 3.2rem)',
                                fontWeight: 900, lineHeight: 1,
                                letterSpacing: '-0.04em',
                                color: k.color,
                                fontVariantNumeric: 'tabular-nums',
                                marginTop: '6px',
                              }}>{k.val}</div>
                            </div>
                            <div style={{
                              fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600,
                              marginTop: '6px',
                            }}>
                              {k.unit}
                            </div>
                          </div>
                        ))}

                        {/* Cell 5: Top Broken Devices */}
                        <div style={{
                          padding: '1.5rem 1.5rem',
                          display: 'flex', flexDirection: 'column',
                          gap: '8px',
                          position: 'relative',
                        }}>
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0,
                            height: '2px', background: 'var(--danger)', opacity: 0.7,
                          }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Wrench size={12} color="var(--danger)" />
                            <span style={{
                              fontSize: '0.62rem', fontWeight: 800,
                              color: 'var(--text-muted)',
                              letterSpacing: '0.16em', textTransform: 'uppercase',
                            }}>อุปกรณ์พังบ่อย</span>
                          </div>
                          {topBrokenDevices.length === 0 ? (
                            <div style={{
                              flex: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--text-muted)',
                              fontSize: '0.72rem', fontWeight: 600,
                              fontStyle: 'italic',
                              padding: '0.5rem',
                              border: '1px dashed var(--border)',
                              borderRadius: '8px',
                              marginTop: '4px',
                            }}>
                              ยังไม่มีงานซ่อม
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                              {topBrokenDevices.slice(0, 3).map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
                                  <span style={{
                                    width: 20, height: 20, borderRadius: '5px',
                                    background: i === 0 ? 'var(--danger)' : i === 1 ? 'var(--warning)' : 'var(--text-muted)',
                                    color: 'white',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                                    fontFamily: 'var(--font-ui)',
                                  }}>
                                    {i + 1}
                                  </span>
                                  <span style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                  <span style={{
                                    fontSize: '0.7rem', fontWeight: 800, color: 'var(--danger)',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>×{d.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* === ACTIVE ASSETS AT STATION === */}
                <div style={{
                  position: 'relative',
                  borderRadius: '20px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  boxShadow: '0 4px 24px -8px rgba(15, 23, 42, 0.08)',
                }}>
                  <div style={{
                    padding: '12px 22px',
                    background: 'linear-gradient(90deg, var(--bg-app), transparent)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '10px', flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Package size={13} color="var(--primary)" />
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 800,
                        letterSpacing: '0.22em', textTransform: 'uppercase',
                        color: 'var(--text-main)',
                      }}>อุปกรณ์ประจำการ ณ สถานี (Active Assets)</span>
                    </div>

                    {activeAssets.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                          <input
                            value={assetSearch}
                            onChange={e => setAssetSearch(e.target.value)}
                            placeholder="ค้นหาอุปกรณ์ / S/N / สัญญา"
                            style={{ width: '190px', padding: '5px 8px 5px 27px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.68rem', outline: 'none' }}
                          />
                        </div>
                        <button
                          onClick={() => setAssetStatusFilter(null)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '0.66rem', fontWeight: 800,
                            color: assetStatusFilter === null ? 'var(--bg-card)' : 'var(--text-muted)',
                            background: assetStatusFilter === null ? 'var(--text-main)' : 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            padding: '3px 9px', borderRadius: '20px', cursor: 'pointer',
                          }}
                        >
                          ทั้งหมด {activeAssets.length}
                        </button>
                        {(Object.keys(ASSET_STATUS_META) as AssetStatusKey[])
                          .filter(key => assetStatusCounts[key] > 0)
                          .map(key => {
                            const meta = ASSET_STATUS_META[key];
                            const isActive = assetStatusFilter === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setAssetStatusFilter(isActive ? null : key)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '0.66rem', fontWeight: 800,
                                  color: meta.color, background: meta.bg,
                                  border: isActive ? `1px solid ${meta.color}` : '1px solid transparent',
                                  padding: '3px 9px', borderRadius: '20px', cursor: 'pointer',
                                }}
                              >
                                {meta.icon} {meta.label} {assetStatusCounts[key]}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '1.5rem' }}>
                    {activeAssets.length === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '3rem 1.5rem',
                        border: '2px dashed var(--border)',
                        borderRadius: '16px',
                        background: 'repeating-linear-gradient(135deg, transparent, transparent 8px, var(--bg-app) 8px, var(--bg-app) 9px)',
                      }}>
                        <Package size={36} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }} />
                        <h4 style={{ margin: '0 0 6px 0', fontWeight: 800, fontSize: '0.95rem' }}>ยังไม่มีอุปกรณ์ติดตั้งประจำด่านนี้</h4>
                        <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                          เมื่อมีการทำเรื่องเบิกพัสดุลงด่านนี้ รายการพัสดุจะถูกลงบันทึกเป็นอุปกรณ์ประจำด่านโดยอัตโนมัติ
                        </p>
                        <button
                          onClick={() => navigate(`/withdrawal?station_id=${details.station.id}`)}
                          className="btn btn-outline btn-sm"
                          style={{ borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, border: '1px solid var(--primary)', color: 'var(--primary)', background: 'transparent' }}
                        >
                          เบิกพัสดุลงด่านทันที
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                        {visibleAssets.length === 0 && (
                          <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา
                          </div>
                        )}
                        {visibleAssets.map((asset) => {
                          const meta = ASSET_STATUS_META[asset.status];
                          const isExpanded = expandedAssetId === asset.id;
                          const displayedCondition = isExpanded ? conditionDraft.status : (asset.condition || 'ปกติ');
                          const condMeta = CONDITION_META[displayedCondition] || CONDITION_META['ปกติ'];

                          const assetWithdrawals = isExpanded ? (() => {
                            if (!details || !details.withdrawals) return [];
                            const list: Array<{
                              id: number;
                              date: string;
                              quantity: number;
                              project: string;
                              contract: string;
                              sns: string[];
                            }> = [];

                            details.withdrawals.forEach(w => {
                              if (w.items) {
                                const match = w.items.find(item => item.inventory_id === asset.id);
                                if (match) {
                                  list.push({
                                    id: w.id,
                                    date: w.withdrawal_date || w.created_at,
                                    quantity: match.quantity,
                                    project: w.project_name || 'ไม่ระบุโครงการ',
                                    contract: w.contract_no
                                      ? `${w.contract_no}${w.contract_year ? ` (ปี ${w.contract_year})` : ''}`
                                      : w.contract_reference_type === 'none'
                                        ? `ไม่มีสัญญา${w.contract_reference_note ? ` — ${w.contract_reference_note}` : ''}`
                                        : 'ไม่ระบุสัญญา',
                                    sns: match.serial_numbers ? match.serial_numbers.split(', ').filter(s => s.trim()) : []
                                  });
                                }
                              }
                            });
                            return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                          })() : [];

                          return (
                          <div
                            key={asset.id}
                            onClick={() => toggleAsset(asset)}
                            style={{
                              display: 'flex', flexDirection: 'column', gap: '10px',
                              padding: '12px',
                              background: 'var(--bg-app)',
                              border: isExpanded ? `1px solid ${meta.color}` : '1px solid var(--border)',
                              borderRadius: '12px',
                              cursor: 'pointer',
                              transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              {/* Image Thumbnail */}
                              <div style={{
                                width: '54px', height: '54px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {asset.image ? (
                                  <img src={`${UPLOAD_URL}/uploads/${asset.image}`} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                  <Package size={22} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                                )}
                              </div>

                              {/* Details */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.name}>
                                  {asset.name}
                                </h4>
                                <p style={{ margin: '2px 0 4px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  รุ่น/โมเดล: {asset.model}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: '4px' }}>
                                    จำนวน: {asset.quantity}
                                  </span>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    fontSize: '0.68rem', fontWeight: 800,
                                    color: meta.color, background: meta.bg,
                                    padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap'
                                  }}>
                                    {meta.icon} {meta.label}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>สภาพ:</span>
                                  {asset.instances && asset.instances.length > 0 ? (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                      {Object.entries(
                                        asset.instances.reduce((acc, inst) => {
                                          const cond = inst.condition || 'New';
                                          acc[cond] = (acc[cond] || 0) + 1;
                                          return acc;
                                        }, {} as Record<string, number>)
                                      ).map(([cond, count]) => {
                                        const meta = INSTANCE_CONDITION_META[cond] || INSTANCE_CONDITION_META['New'];
                                        return (
                                          <span key={cond} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                            fontSize: '0.65rem', fontWeight: 800,
                                            color: meta.color, background: meta.bg,
                                            padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap'
                                          }}>
                                            {meta.icon} {meta.label}: {count}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        fontSize: '0.68rem', fontWeight: 800,
                                        color: condMeta.color, background: condMeta.bg,
                                        padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        {condMeta.icon} {displayedCondition}
                                      </span>
                                      {isExpanded && conditionDraft.status !== asset.condition && (
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--warning)', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center' }}>
                                          (ยังไม่บันทึก)
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                                {asset.latestWithdrawalDate && (
                                  <div style={{ marginTop: '8px', padding: '7px 8px', borderRadius: '7px', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '0.68rem', lineHeight: 1.55 }}>
                                    <div style={{ color: 'var(--text-main)', fontWeight: 800 }}>
                                      เบิกล่าสุด {new Date(asset.latestWithdrawalDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      {asset.latestWithdrawalId ? ` · WD-${asset.latestWithdrawalId}` : ''}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.latestProject}>
                                      {asset.latestProject} · {asset.latestContract}
                                    </div>
                                    {asset.sourceCount && asset.sourceCount > 1 && (
                                      <div style={{ marginTop: '2px', color: 'var(--primary)', fontWeight: 800 }}>มีแหล่งที่มา {asset.sourceCount} รอบ · คลิกเพื่อดูรายละเอียด</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  borderTop: '1px solid var(--border)', paddingTop: '10px',
                                  display: 'flex', flexDirection: 'column', gap: '6px'
                                }}
                              >
                                {asset.activeTickets.length > 0 ? (
                                  asset.activeTickets.slice(0, 4).map(t => (
                                    <div key={t.id} style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                      fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px',
                                      background: 'var(--bg-card)', border: '1px solid var(--border)'
                                    }}>
                                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.ticket_no}</span>
                                      <span style={{ color: 'var(--text-muted)' }}>{t.type === 'claim' ? 'เคลม' : 'ซ่อม'} · {t.status}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ไม่มีงานซ่อม/เคลมที่กำลังดำเนินการสำหรับอุปกรณ์นี้</span>
                                )}
                                {asset.instances && asset.instances.length > 0 ? (
                                  /* ตั้งสภาพอุปกรณ์รายเครื่อง (แยกตาม S/N) */
                                  <div style={{
                                    marginTop: '6px', padding: '8px', borderRadius: '8px',
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    display: 'flex', flexDirection: 'column', gap: '8px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        สภาพอุปกรณ์แต่ละเครื่อง (แยกราย S/N)
                                      </span>
                                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                        ทั้งหมด {asset.instances.length} ชิ้น
                                      </span>
                                    </div>
                                    <div style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '6px',
                                      maxHeight: '200px',
                                      overflowY: 'auto',
                                      paddingRight: '4px'
                                    }}>
                                      {asset.instances.map(inst => {
                                        const instMeta = INSTANCE_CONDITION_META[inst.condition] || INSTANCE_CONDITION_META['New'];
                                        const isUpdating = updatingInstanceId === inst.id;
                                        return (
                                          <div key={inst.id} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '6px 10px', borderRadius: '6px',
                                            background: 'var(--bg-app)', border: '1px solid var(--border)',
                                            gap: '8px'
                                          }}>
                                            <div style={{ minWidth: 0 }}>
                                              <span
                                                onClick={() => navigate(`/asset/${inst.id}`)}
                                                title="ดูพาสปอร์ต/ประวัติเครื่องนี้"
                                                style={{
                                                  fontSize: '0.72rem', fontWeight: 700,
                                                  fontFamily: 'var(--font-ui)',
                                                  color: 'var(--primary)',
                                                  background: 'var(--bg-card)',
                                                  padding: '2px 6px', borderRadius: '4px',
                                                  border: '1px solid var(--border)',
                                                  cursor: 'pointer', textDecoration: 'underline dotted'
                                                }}>
                                                S/N: {inst.serial_number || '—'}
                                              </span>
                                              {(inst.withdrawal_date || inst.contract_no_snapshot || inst.project_name_snapshot) && (
                                                <div style={{ marginTop: '4px', fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${inst.project_name_snapshot || 'ไม่ระบุโครงการ'} · ${inst.contract_no_snapshot || 'ไม่ระบุสัญญา'}`}>
                                                  {inst.withdrawal_date ? new Date(inst.withdrawal_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ไม่ระบุวันที่'} · {inst.contract_no_snapshot || 'ไม่ระบุสัญญา'}{inst.contract_year_snapshot ? ` (${inst.contract_year_snapshot})` : ''}
                                                </div>
                                              )}
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              {inst.status && inst.status !== 'Withdrawn' && (() => {
                                                const sMeta = INSTANCE_STATUS_META[inst.status] ?? { label: inst.status, color: 'var(--text-muted)', bg: 'var(--bg-subtle)' };
                                                return (
                                                  <span style={{
                                                    padding: '2px 7px', borderRadius: '20px', fontSize: '0.65rem',
                                                    fontWeight: 700, color: sMeta.color, background: sMeta.bg,
                                                    whiteSpace: 'nowrap', border: `1px solid ${sMeta.color}22`
                                                  }}>
                                                    {sMeta.label}
                                                  </span>
                                                );
                                              })()}
                                              <Select
                                                value={inst.condition || 'New'}
                                                options={INSTANCE_CONDITION_OPTIONS.map(opt => {
                                                  const optMeta = INSTANCE_CONDITION_META[opt] || INSTANCE_CONDITION_META['New'];
                                                  return { value: opt, label: `${optMeta.icon} ${optMeta.label}` };
                                                })}
                                                disabled={isUpdating}
                                                onChange={(value) => handleInstanceConditionChange(inst.id, String(value))}
                                                className="station-inline-select"
                                                style={{
                                                  width: 'auto', minWidth: '112px',
                                                  fontSize: '0.7rem', fontWeight: 800,
                                                  padding: '4px 26px 4px 8px', borderRadius: '6px',
                                                  border: `1.2px solid ${instMeta.color}`,
                                                  background: instMeta.bg,
                                                  color: instMeta.color,
                                                }}
                                              />
                                              {isUpdating && (
                                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>...</span>
                                              )}
                                              {hasPermission('manage.stations') && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMoveAsset({ inventoryId: asset.id, instanceId: inst.id, name: `${asset.name} ${inst.serial_number || ''}`, quantity: 1 });
                                                  }}
                                                  style={{ padding: '4px 7px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--info)', fontSize: '0.62rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                  ย้าย
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {asset.quantity > asset.instances.length && (
                                      <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        padding: '6px 10px', borderRadius: '6px',
                                        background: 'var(--bg-app)', border: '1px dashed var(--border)',
                                        fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600,
                                        fontStyle: 'italic', marginTop: '4px'
                                      }}>
                                        ℹ️ อีก {asset.quantity - asset.instances.length} เครื่อง (ยังไม่ได้ระบุ S/N ในระบบ)
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* ตั้งสภาพอุปกรณ์ (manual) สำหรับพัสดุไม่มี S/N */
                                  <div style={{
                                    marginTop: '6px', padding: '8px', borderRadius: '8px',
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    display: 'flex', flexDirection: 'column', gap: '6px'
                                  }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-main)' }}>ปรับสภาพอุปกรณ์</span>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      <Select
                                        value={conditionDraft.status}
                                        options={CONDITION_OPTIONS.map(opt => {
                                          const optMeta = CONDITION_META[opt] || CONDITION_META['ปกติ'];
                                          return { value: opt, label: `${optMeta.icon} ${opt}` };
                                        })}
                                        onChange={(value) => setConditionDraft(d => ({ ...d, status: String(value) }))}
                                        disabled={!hasPermission('manage.stations')}
                                        className="station-inline-select"
                                        style={{
                                          width: 'auto', minWidth: '100px', flex: '0 0 auto',
                                          fontSize: '0.72rem', fontWeight: 800,
                                          padding: '5px 24px 5px 8px', borderRadius: '6px',
                                          border: `1.5px solid ${condMeta.color}`,
                                          background: condMeta.bg,
                                          color: condMeta.color,
                                        }}
                                      />
                                      <input
                                        type="text"
                                        value={conditionDraft.note}
                                        onChange={(e) => setConditionDraft(d => ({ ...d, note: e.target.value }))}
                                        disabled={!hasPermission('manage.stations')}
                                        placeholder="หมายเหตุ (ไม่บังคับ)"
                                        style={{
                                          flex: 1, minWidth: '120px', fontSize: '0.72rem',
                                          padding: '5px 8px', borderRadius: '6px',
                                          border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)'
                                        }}
                                      />
                                      {hasPermission('manage.stations') && <button
                                        onClick={() => saveCondition(asset)}
                                        disabled={savingCondition}
                                        style={{
                                          fontSize: '0.72rem', fontWeight: 800, color: '#fff',
                                          background: savingCondition ? 'var(--text-muted)' : 'var(--primary)',
                                          border: 'none', borderRadius: '6px', padding: '5px 12px',
                                          cursor: savingCondition ? 'not-allowed' : 'pointer'
                                        }}
                                      >
                                        {savingCondition ? 'กำลังบันทึก...' : 'บันทึกสภาพ'}
                                      </button>}
                                    </div>
                                    {asset.conditionBy && (
                                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                        แก้ไขล่าสุดโดย {asset.conditionBy}
                                        {asset.conditionAt ? ` · ${new Date(asset.conditionAt).toLocaleString('th-TH')}` : ''}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* ประวัติการนำเข้าอุปกรณ์ */}
                                <div style={{
                                   marginTop: '6px', padding: '8px', borderRadius: '8px',
                                   background: 'var(--bg-card)', border: '1px solid var(--border)',
                                   display: 'flex', flexDirection: 'column', gap: '8px'
                                 }}>
                                   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                       <HistoryIcon size={14} style={{ color: 'var(--primary)' }} />
                                       <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                         ประวัติการนำเข้าอุปกรณ์ (เบิกพัสดุ)
                                       </span>
                                     </div>
                                     <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                       ทั้งหมด {assetWithdrawals.length} ครั้ง
                                     </span>
                                   </div>
                                   
                                   {assetWithdrawals.length > 0 ? (
                                     <div style={{
                                       display: 'flex',
                                       flexDirection: 'column',
                                       gap: '6px',
                                       maxHeight: '180px',
                                       overflowY: 'auto',
                                       paddingRight: '4px'
                                     }}>
                                       {assetWithdrawals.map((item, idx) => (
                                         <div key={idx} style={{
                                           display: 'flex', flexDirection: 'column', gap: '4px',
                                           padding: '8px', borderRadius: '6px',
                                           background: 'var(--bg-app)', border: '1px solid var(--border)',
                                           fontSize: '0.68rem'
                                         }}>
                                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
                                             <span style={{ color: 'var(--primary)' }}>
                                               เบิกลงสถานีเมื่อ: {new Date(item.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                             </span>
                                             <span style={{ background: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px', color: 'var(--primary)' }}>
                                               {item.quantity} ชิ้น
                                             </span>
                                           </div>
                                           <div style={{ color: 'var(--text-main)', marginTop: '2px', textAlign: 'left' }}>
                                             <strong>โครงการ:</strong> {item.project}
                                           </div>
                                           <div style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                                             <strong>สัญญา:</strong> {item.contract}
                                           </div>
                                           {item.sns && item.sns.length > 0 && (
                                             <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px', alignItems: 'center' }}>
                                               <strong style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>S/N ในรอบนี้:</strong>
                                               {item.sns.map((sn, snIdx) => (
                                                 <span key={snIdx} style={{
                                                   background: 'var(--bg-card)', border: '1px solid var(--border)',
                                                   padding: '1px 5px', borderRadius: '4px', fontFamily: 'var(--font-ui)', fontSize: '0.62rem',
                                                   color: 'var(--text-main)'
                                                 }}>
                                                   {sn}
                                                 </span>
                                               ))}
                                             </div>
                                           )}
                                         </div>
                                       ))}
                                     </div>
                                   ) : (
                                     <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '4px' }}>
                                       ไม่มีประวัติการนำเข้าในระบบ
                                     </span>
                                   )}
                                 </div>

                                 {hasPermission('manage.stations') && asset.quantity > (asset.instances?.length || 0) && (
                                   <button
                                     type="button"
                                     onClick={() => setMoveAsset({ inventoryId: asset.id, name: asset.name, quantity: Math.max(0, asset.quantity - (asset.instances?.length || 0)) })}
                                     style={{
                                      marginTop: '4px', fontSize: '0.72rem', fontWeight: 800,
                                      color: 'var(--info)', background: 'var(--info-light)',
                                      border: '1px solid var(--info)', borderRadius: '8px',
                                      padding: '6px 10px', cursor: 'pointer'
                                    }}
                                   >
                                     ↗ ย้ายอุปกรณ์ไปสถานีอื่น
                                   </button>
                                 )}

                                 <button
                                   onClick={() => navigate(`/new?station_id=${details.station.id}`)}
                                   style={{
                                    marginTop: '4px', fontSize: '0.72rem', fontWeight: 800,
                                    color: 'var(--primary)', background: 'var(--primary-light)',
                                    border: '1px solid var(--primary)', borderRadius: '8px',
                                    padding: '6px 10px', cursor: 'pointer'
                                  }}
                                >
                                  + แจ้งซ่อมอุปกรณ์นี้
                                </button>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* === QR labels for field inspection (offline) === */}
                <StationQrLabels stationId={details.station.id} stationName={details.station.name} withdrawals={details.withdrawals} />

                {/* === ASSET TIMELINE — source, return, repair and transfer events === */}
                {(() => {
                  const assetEvents = details.asset_events || [];
                  if (assetEvents.length === 0) return null;
                  return (
                  <section className="glass-card" style={{ marginTop: '1.25rem', padding: '1.25rem 1.5rem', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 800 }}>
                          <HistoryIcon size={17} color="var(--primary)" /> ประวัติความเคลื่อนไหวของอุปกรณ์
                        </h3>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                          แสดงการเบิก คืน และเหตุการณ์ที่เกี่ยวข้องกับอุปกรณ์ของสถานีนี้
                        </p>
                      </div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)' }}>{assetEvents.length} เหตุการณ์</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                      {assetEvents.slice(0, 12).map(event => {
                        const eventMeta = ({
                          WITHDRAW_TO_STATION: { label: 'เบิกลงสถานี', color: 'var(--primary)', bg: 'var(--primary-light)' },
                          INSTALL_FROM_TECHNICIAN: { label: 'ช่างติดตั้ง', color: 'var(--primary)', bg: 'var(--primary-light)' },
                          RETURN_TO_WAREHOUSE: { label: 'คืนเข้าคลัง', color: 'var(--success)', bg: 'var(--success-light)' },
                          TRANSFER: { label: 'ย้ายสถานี', color: 'var(--info)', bg: 'var(--info-light)' },
                          REPLACE: { label: 'เปลี่ยนอุปกรณ์', color: 'var(--warning)', bg: 'var(--warning-light)' },
                          DISPOSE: { label: 'ปลดระวาง', color: 'var(--danger)', bg: 'var(--danger-light)' },
                        }[event.event_type] || { label: event.event_type, color: 'var(--text-muted)', bg: 'var(--bg-subtle)' });
                        return (
                          <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) auto', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700 }}>{new Date(event.event_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {event.device_name || 'อุปกรณ์'} {event.quantity ? `· ${event.quantity} ชิ้น` : ''}
                              </div>
                              <div style={{ marginTop: '2px', fontSize: '0.64rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {event.project_name_snapshot || 'ไม่ระบุโครงการ'} · {event.contract_no_snapshot || 'ไม่ระบุสัญญา'}{event.contract_year_snapshot ? ` (ปี ${event.contract_year_snapshot})` : ''}
                              </div>
                            </div>
                            <span style={{ padding: '3px 7px', borderRadius: '999px', background: eventMeta.bg, color: eventMeta.color, fontSize: '0.62rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{eventMeta.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  );
                })()}

                {/* === ACTIVITY LOG — 4 channel feed === */}
                {(() => {
                  const channels = [
                    {
                      code: 'RPR', label: 'งานซ่อม', color: 'var(--primary)', bgTint: 'var(--primary-light)',
                      count: filteredDetails.repairs.length,
                      navigate: () => navigate('/repairs'),
                      empty: 'ไม่มีงานซ่อม',
                      icon: <Wrench size={24} style={{ opacity: 0.4, marginBottom: '6px', color: 'var(--primary)' }} />,
                      cta: 'แจ้งซ่อมด่วนที่นี่',
                      ctaAction: () => navigate(`/new?station_id=${details.station.id}`),
                      items: filteredDetails.repairs.slice(0, 6).map(item => ({
                        id: item.id,
                        code: item.ticket_no,
                        title: item.device_name,
                        subtitle: item.reporter,
                        time: item.created_at,
                        extra: (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span className={`badge badge-priority-${item.priority === 'วิกฤต' ? 'critical' : item.priority === 'ด่วนมาก' ? 'urgent' : item.priority === 'ด่วน' ? 'high' : 'normal'}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{item.priority}</span>
                            <span className={`badge badge-${item.status}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{item.status}</span>
                          </div>
                        ),
                        href: `/repairs/${item.id}`,
                      })),
                    },
                    {
                      code: 'CLM', label: 'งานเคลม', color: 'var(--warning)', bgTint: 'var(--warning-light)',
                      count: filteredDetails.claims.length,
                      navigate: () => navigate('/claim-history'),
                      empty: 'ไม่มีงานเคลม',
                      icon: <Shield size={24} style={{ opacity: 0.4, marginBottom: '6px', color: 'var(--warning)' }} />,
                      cta: 'แจ้งเคลมพัสดุที่นี่',
                      ctaAction: () => navigate(`/claim?station_id=${details.station.id}`),
                      items: filteredDetails.claims.slice(0, 6).map(item => ({
                        id: item.id,
                        code: item.ticket_no,
                        title: item.device_name,
                        subtitle: item.reporter,
                        time: item.created_at,
                        extra: <span className={`badge badge-${item.status}`} style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{item.status === 'กำลังซ่อม' ? 'กำลังเคลม' : item.status}</span>,
                        href: `/claim-history/${item.id}`,
                      })),
                    },
                    {
                      code: 'WTD', label: 'การเบิก', color: 'var(--success)', bgTint: 'var(--success-light)',
                      count: filteredDetails.withdrawals.length,
                      navigate: () => navigate('/withdrawal-history'),
                      empty: 'ไม่มีการเบิก',
                      icon: <Package size={24} style={{ opacity: 0.4, marginBottom: '6px', color: 'var(--success)' }} />,
                      cta: 'ทำรายการเบิกที่นี่',
                      ctaAction: () => navigate(`/withdrawal?station_id=${details.station.id}`),
                      items: filteredDetails.withdrawals.slice(0, 6).map(item => {
                        const itemCount = item.items?.length || (item.items_summary ? item.items_summary.split(',').length : 0);
                        return {
                          id: item.id,
                          code: `WD-${item.id.toString().padStart(6, '0')}`,
                          title: `${itemCount} รายการ`,
                          subtitle: item.recipient,
                          time: item.created_at,
                          extra: <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 7px', borderRadius: '4px', background: 'var(--success-light)', color: 'var(--success)' }}>{item.type}</span>,
                          href: `/withdrawal/${item.id}`,
                        };
                      }),
                    },
                    {
                      code: 'TXN', label: 'ความเคลื่อนไหว', color: 'var(--info)', bgTint: 'var(--info-light)',
                      count: filteredDetails.transactions.length,
                      navigate: () => navigate('/transactions'),
                      empty: 'ไม่มีความเคลื่อนไหว',
                      icon: <Activity size={24} style={{ opacity: 0.4, marginBottom: '6px', color: 'var(--info)' }} />,
                      cta: 'ดูประวัติคลังพัสดุ',
                      ctaAction: () => navigate('/inventory'),
                      items: filteredDetails.transactions.slice(0, 6).map(tx => {
                        const isIn = tx.transaction_type === 'ADD_STOCK' || tx.transaction_type === 'RETURN';
                        const qty = tx.quantity_added || tx.quantity_withdrawn || tx.quantity_borrowed || tx.quantity_returned || 0;
                        const accent = isIn ? 'var(--success)' : 'var(--danger)';
                        return {
                          id: tx.id,
                          code: `${isIn ? '+' : '−'}${qty}`,
                          codeColor: accent,
                          title: tx.product_name,
                          subtitle: tx.user_name || 'ระบบ',
                          time: tx.created_at,
                          extra: <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 7px', borderRadius: '4px', background: `${accent}1a`, color: accent, fontFamily: 'var(--font-ui)', letterSpacing: '0.08em' }}>{isIn ? 'IN' : 'OUT'}</span>,
                          href: null as string | null,
                        };
                      }),
                    },
                  ];

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                      {channels.map((ch, ci) => (
                        <div key={ci} style={{
                          background: 'var(--bg-card)',
                          borderRadius: '16px',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                          display: 'flex', flexDirection: 'column',
                          boxShadow: '0 2px 12px -4px rgba(15, 23, 42, 0.05)',
                        }}>
                          {/* Channel header */}
                          <div style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: `linear-gradient(180deg, ${ch.bgTint}, transparent)`,
                            position: 'relative',
                          }}>
                            {/* Accent top stripe */}
                            <div style={{
                              position: 'absolute', top: 0, left: 0, right: 0,
                              height: '3px', background: ch.color,
                            }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  fontSize: '0.58rem', fontWeight: 800,
                                  padding: '3px 7px', borderRadius: '5px',
                                  background: ch.color, color: 'white',
                                  letterSpacing: '0.15em',
                                  fontFamily: 'var(--font-ui)',
                                }}>{ch.code}</span>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                  {ch.label}
                                </h4>
                              </div>
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 800,
                                color: ch.color,
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {ch.count}
                              </span>
                            </div>
                          </div>

                          {/* Log entries */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {ch.items.length === 0 ? (
                              <div style={{
                                flex: 1,
                                minHeight: '220px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--text-muted)',
                                fontSize: '0.78rem', fontWeight: 600,
                                background: 'repeating-linear-gradient(135deg, transparent, transparent 8px, var(--bg-app) 8px, var(--bg-app) 9px)',
                                padding: '1.5rem',
                                textAlign: 'center',
                              }}>
                                {ch.icon}
                                <span style={{
                                  padding: '4px 10px',
                                  background: 'var(--bg-card)',
                                  borderRadius: '8px',
                                  border: '1px dashed var(--border)',
                                  fontStyle: 'italic',
                                  marginBottom: '8px',
                                  display: 'inline-block',
                                }}>
                                  — {ch.empty} —
                                </span>
                                {ch.cta && (
                                  <button
                                    onClick={ch.ctaAction}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: ch.color,
                                      fontSize: '0.74rem',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      padding: '2px 6px',
                                    }}
                                  >
                                    {ch.cta}
                                  </button>
                                )}
                              </div>
                            ) : (
                              ch.items.map((it: { id: number | string; code: string; codeColor?: string; title: string; subtitle: string; time: string; extra?: React.ReactNode; href: string | null }, idx: number) => {
                                const isLast = idx === ch.items.length - 1;
                                return (
                                  <div
                                    key={it.id}
                                    onClick={it.href ? () => { if (it.href) navigate(it.href); } : undefined}
                                    style={{
                                      padding: '11px 14px',
                                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                                      cursor: it.href ? 'pointer' : 'default',
                                      transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (it.href) e.currentTarget.style.background = 'var(--bg-app)'; }}
                                    onMouseLeave={e => { if (it.href) e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    {/* Top row: code + time */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                      <span style={{
                                        fontSize: '0.68rem', fontWeight: 800,
                                        color: it.codeColor || ch.color,
                                        fontFamily: 'var(--font-ui)',
                                        letterSpacing: '0.04em',
                                      }}>{it.code}</span>
                                      <span style={{
                                        fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700,
                                        fontFamily: 'var(--font-ui)',
                                      }}>{formatRelativeTime(it.time)}</span>
                                    </div>
                                    {/* Title */}
                                    <div style={{
                                      fontSize: '0.82rem', fontWeight: 700,
                                      color: 'var(--text-main)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      marginBottom: it.extra ? '6px' : '2px',
                                    }}>{it.title}</div>
                                    {/* Extra badges */}
                                    {it.extra}
                                    {/* Subtitle (reporter/recipient/user) */}
                                    {it.subtitle && (
                                      <div style={{
                                        marginTop: '6px',
                                        fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>
                                        <span style={{ opacity: 0.55, marginRight: '4px' }}>›</span>{it.subtitle}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Footer "ดูทั้งหมด" */}
                          {ch.count > 0 && (
                            <button
                              onClick={ch.navigate}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                borderTop: '1px solid var(--border)',
                                padding: '10px',
                                fontSize: '0.7rem', fontWeight: 800,
                                color: ch.color,
                                cursor: 'pointer',
                                letterSpacing: '0.05em',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = ch.bgTint}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              ดูทั้งหมด →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
         </div>
      )}

      {moveAsset && details?.station?.id && (
        <div className="modal-overlay" style={{ zIndex: 1080 }} onClick={() => !movingAsset && setMoveAsset(null)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Navigation size={20} color="var(--info)" /> ย้ายอุปกรณ์ไปสถานีอื่น
              </h3>
              <button className="close-btn" onClick={() => setMoveAsset(null)} disabled={movingAsset}><X size={20} /></button>
            </div>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
              อุปกรณ์ต้นทาง: <strong style={{ color: 'var(--text-main)' }}>{moveAsset.name}</strong><br />
              ระบบจะคงสัญญาและโครงการต้นทางไว้ พร้อมบันทึกประวัติการย้ายสถานี
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '7px', fontSize: '0.85rem', fontWeight: 700 }}>สถานีปลายทาง *</label>
                <StationSelector
                  selectedStationId={moveTargetStationId}
                  required
                  showArea={false}
                  ariaLabel="เลือกสถานีปลายทาง"
                  onChange={(data) => setMoveTargetStationId(data.stationId)}
                />
              </div>
              {!moveAsset.instanceId && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'block', marginBottom: '7px', fontSize: '0.85rem', fontWeight: 700 }}>จำนวนที่ย้าย *</label>
                  <input
                    type="number"
                    min={1}
                    max={moveAsset.quantity}
                    value={moveQuantity}
                    onChange={e => setMoveQuantity(Math.max(1, Math.min(moveAsset.quantity, Number(e.target.value) || 1)))}
                    className="form-control"
                  />
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>คงเหลือที่สถานีต้นทาง {moveAsset.quantity} ชิ้น</span>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'block', marginBottom: '7px', fontSize: '0.85rem', fontWeight: 700 }}>หมายเหตุ</label>
                <textarea value={moveNote} onChange={e => setMoveNote(e.target.value)} rows={3} maxLength={500} className="form-control" placeholder="เช่น ย้ายเพื่อทดแทนอุปกรณ์เสีย" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setMoveAsset(null)} disabled={movingAsset}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" onClick={submitMoveAsset} disabled={movingAsset || !moveTargetStationId}>
                  {movingAsset ? 'กำลังบันทึก...' : 'ยืนยันการย้าย'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Station Create/Edit Modal — แบบฟอร์มละเอียด บังคับกรอกทุกฟิลด์ + field-level validation */}
      {stationModal.open && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={closeStationModal}>
          <div className="modal-content" style={{ maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '0.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {stationModal.mode === 'edit' ? <Pencil size={20} color="var(--primary)" /> : <Plus size={20} color="var(--primary)" />}
                {stationModal.mode === 'edit' ? 'แก้ไขข้อมูลสถานี' : 'เพิ่มสถานีใหม่'}
              </h3>
              <button className="close-btn" onClick={closeStationModal}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              ⚠️ กรอกข้อมูลให้ครบทุกช่อง — สถานีเป็นข้อมูลแม่บทที่ใช้ในทุกการเบิก/ซ่อม/เคลม
            </p>
            <form onSubmit={handleStationSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>

                {/* ชื่อสถานี */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>ชื่อสถานี / จุดติดตั้ง <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={e => updateField('name', e.target.value)}
                    placeholder="เช่น ด่านชั่งบางปะอิน"
                    maxLength={100}
                    autoFocus
                    style={fieldErrors.name ? { borderColor: 'var(--danger)' } : undefined}
                  />
                  {fieldErrors.name && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.name}</p>
                  )}
                </div>

                {/* ประเภทสถานี */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>ประเภทสถานี <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <Select
                    value={formData.station_type}
                    options={STATION_TYPE_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                    onChange={val => {
                      updateField('station_type', String(val));
                      if (val !== 'OTHER') updateField('custom_type', '');
                    }}
                    style={fieldErrors.station_type ? { border: '1.5px solid var(--danger)' } : undefined}
                  />
                  {fieldErrors.station_type && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.station_type}</p>
                  )}
                  {formData.station_type === 'OTHER' && (
                    <>
                      <input
                        type="text"
                        className="form-control"
                        style={{ marginTop: '8px', ...(fieldErrors.custom_type ? { borderColor: 'var(--danger)' } : {}) }}
                        placeholder="ระบุประเภทเอง เช่น จุดตรวจศุลกากร"
                        value={formData.custom_type}
                        onChange={e => updateField('custom_type', e.target.value)}
                        maxLength={50}
                      />
                      {fieldErrors.custom_type && (
                        <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.custom_type}</p>
                      )}
                    </>
                  )}
                </div>

                {/* ผู้รับผิดชอบสถานี (NEW) */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>
                    ผู้รับผิดชอบสถานี <span style={{ color: 'var(--danger)' }}>*</span>
                    <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>(ระบุชื่อผู้ดูแลเพื่อติดตามรับผิดชอบ)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.responsible_person}
                    onChange={e => updateField('responsible_person', e.target.value)}
                    placeholder="เช่น นายสมชาย ใจดี"
                    maxLength={100}
                    style={fieldErrors.responsible_person ? { borderColor: 'var(--danger)' } : undefined}
                  />
                  {fieldErrors.responsible_person && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.responsible_person}</p>
                  )}
                </div>

                {/* วันที่เริ่มใช้งานจริง */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>
                    วันที่เริ่มใช้งานจริง
                    <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>(ถ้าทราบ)</span>
                  </label>
                  <DatePicker
                    value={formData.operational_start_date}
                    onChange={value => updateField('operational_start_date', value)}
                  />
                </div>

                {/* จังหวัด — dropdown grouped by region */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>จังหวัด <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <Select
                    value={formData.province}
                    options={flatProvinceOptions}
                    onChange={val => handleProvinceChange(String(val))}
                    style={fieldErrors.province ? { border: '1.5px solid var(--danger)' } : undefined}
                  />
                  {fieldErrors.province && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.province}</p>
                  )}
                  {formData.province && getRegionFromProvince(formData.province) && !fieldErrors.province && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>
                      ✓ ระบบเลือกภูมิภาค: <strong>{getRegionFromProvince(formData.province)}</strong> ให้อัตโนมัติ
                    </p>
                  )}
                </div>

                {/* ภูมิภาค */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>ภูมิภาค <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <Select
                    value={formData.region}
                    options={[{ label: '-- เลือกภูมิภาค --', value: '' }, ...REGIONS.map(r => ({ label: r, value: r }))] }
                    onChange={val => updateField('region', String(val))}
                    style={fieldErrors.region ? { border: '1.5px solid var(--danger)' } : undefined}
                  />
                  {fieldErrors.region && (
                    <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.region}</p>
                  )}
                </div>

                {/* ทางหลวง + ทิศทาง */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>เส้นทางหลวง <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.highway_no}
                      onChange={e => updateField('highway_no', e.target.value)}
                      placeholder="เช่น 1, 32, 41"
                      maxLength={20}
                      style={fieldErrors.highway_no ? { borderColor: 'var(--danger)' } : undefined}
                    />
                    {fieldErrors.highway_no && (
                      <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.highway_no}</p>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>ทิศทาง <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <Select
                      value={formData.direction}
                      options={[
                        { label: 'ขาเข้า (INBOUND)', value: 'INBOUND' },
                        { label: 'ขาออก (OUTBOUND)', value: 'OUTBOUND' },
                        { label: '2 ทาง (BOTH)', value: 'BOTH' },
                        { label: 'ไม่ระบุ (NONE)', value: 'NONE' }
                      ]}
                      onChange={val => updateField('direction', val as StationFormData['direction'])}
                      style={fieldErrors.direction ? { border: '1.5px solid var(--danger)' } : undefined}
                    />
                    {fieldErrors.direction && (
                      <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.direction}</p>
                    )}
                  </div>
                </div>

                {/* รวม error message */}
                {Object.keys(fieldErrors).length > 0 && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600, padding: '10px 12px', background: 'var(--danger-light)', borderRadius: '8px' }}>
                    ⚠️ มีข้อมูล {Object.keys(fieldErrors).length} ช่องที่ต้องแก้ไข — โปรดตรวจสอบช่องที่ขีดเส้นแดง
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                  <Button type="button" variant="outline" style={{ flex: 1 }} onClick={closeStationModal} disabled={isSaving}>
                    ยกเลิก
                  </Button>
                  <Button type="submit" variant="primary" style={{ flex: 1 }} disabled={isSaving}>
                    {isSaving ? 'กำลังบันทึก...' : stationModal.mode === 'edit' ? 'บันทึกการแก้ไข' : 'เพิ่มสถานี'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Sticker Modal */}
      {qrModalOpen && qrStation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '400px',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            color: '#ffffff',
            position: 'relative'
          }}>
            <button 
              onClick={() => setQrModalOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px', color: '#ffffff', textAlign: 'center' }}>
              QR Code ประจำสถานี
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '24px', textAlign: 'center' }}>
              สแกนด้วยสมาร์ทโฟนเพื่อแจ้งซ่อมด่วนที่ด่านนี้
            </p>

            <div id="station-qr-sticker" style={{
              background: '#ffffff',
              padding: '20px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
              marginBottom: '24px',
              color: '#0f172a'
            }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '6px', textAlign: 'center', letterSpacing: '0.05em' }}>
                {qrStation.code || `STN-${qrStation.id}`}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '14px', textAlign: 'center' }}>
                {qrStation.name} ({qrStation.direction})
              </div>
              
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/new?station_id=${qrStation.id}`)}`} 
                alt={`QR Code for ${qrStation.name}`}
                style={{ width: '200px', height: '200px', display: 'block' }}
              />

              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '12px', wordBreak: 'break-all', textAlign: 'center' }}>
                {`${window.location.origin}/new?station_id=${qrStation.id}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setQrModalOpen(false)}
                className="btn btn-outline"
                style={{
                  flex: 1,
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff'
                }}
              >
                ปิด
              </button>
              <button
                onClick={() => {
                  const printContent = document.getElementById('station-qr-sticker');
                  if (printContent) {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(
                        '<html>' +
                          '<head>' +
                            '<title>Print QR Sticker - ' + qrStation.name + '</title>' +
                            '<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&display=swap" rel="stylesheet">' +
                            '<style>' +
                              'body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: "Anuphan", "Noto Sans Thai", "Segoe UI", sans-serif; }' +
                              '.sticker { border: 2px solid #000; padding: 25px; border-radius: 15px; text-align: center; width: 280px; }' +
                              '.code { font-size: 22px; font-weight: bold; margin-bottom: 5px; }' +
                              '.name { font-size: 15px; color: #333; margin-bottom: 15px; }' +
                              '.url { font-size: 10px; color: #666; margin-top: 10px; word-break: break-all; }' +
                            '</style>' +
                          '</head>' +
                          '<body>' +
                            '<div class="sticker">' +
                              '<div class="code">' + (qrStation.code || ('STN-' + qrStation.id)) + '</div>' +
                              '<div class="name">' + qrStation.name + ' (' + qrStation.direction + ')</div>' +
                              '<img src="' + (printContent.querySelector('img')?.src || '') + '" width="200" height="200" />' +
                              '<div class="url">' + window.location.origin + '/new?station_id=' + qrStation.id + '</div>' +
                            '</div>' +
                            '<script>' +
                              'window.onload = function() {' +
                                'window.print();' +
                                'setTimeout(function() { window.close(); }, 500);' +
                              '};' +
                            '</script>' +
                          '</body>' +
                        '</html>'
                      );
                      printWindow.document.close();
                    }
                  }
                }}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: 'var(--primary)',
                  color: '#0f172a'
                }}
              >
                พิมพ์สติกเกอร์
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StationSearch;
