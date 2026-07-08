import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { useNotification } from '../components/Layout';
import { printElement } from '../utils/pdfGenerator';
import { formatDateThai } from '../utils/formatDate';
import DatePicker from '../components/ui/DatePicker';
import {
  Boxes,
  Zap,
  Download,
  Printer,
  Loader2,
  Calendar,
  PackageCheck,
  FileSignature,
  Wrench,
  ShieldCheck,
  ArrowLeftRight,
  Truck,
  Undo2,
  UserCog,
  ClipboardCheck,
  Activity,
  History
} from 'lucide-react';
import { reportApi } from '../api';
import type { ServerReportPayload } from '../api';

type ReportType =
  | 'inventory_summary'
  | 'low_stock'
  | 'withdrawals'
  | 'purchase_orders'
  | 'repairs'
  | 'claims'
  | 'transactions'
  | 'technician_stock'
  | 'pending_returns'
  | 'technician_workload'
  | 'stock_count'
  | 'asset_lifecycle'
  | 'audit_log';

// Every report is now produced server-side (SQL filtering + preformatted rows).

// Card configuration drives both layout and behavior so adding a report is a one-line change.
type CardConfig = {
  type: ReportType;
  accent: string;
  btnClass: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  dateAware: boolean; // false = snapshot report that ignores the date range
};

type Section = { key: string; label: string; cards: CardConfig[] };

const REPORT_SECTIONS: Section[] = [
  {
    key: 'repair',
    label: 'งานซ่อมและงานเคลม',
    cards: [
      {
        type: 'repairs',
        accent: '#ef4444',
        btnClass: 'btn-report-red',
        icon: <Wrench size={22} />,
        title: 'รายงานสรุปงานซ่อมบำรุง',
        subtitle: 'ประวัติงานซ่อมตามช่วงเวลา',
        description:
          'สรุปใบงานซ่อม อาการเสีย สถานะการดำเนินงาน ช่างผู้รับผิดชอบ ความเร่งด่วน และสถานที่ปฏิบัติงาน',
        dateAware: true
      },
      {
        type: 'claims',
        accent: '#8b5cf6',
        btnClass: 'btn-report-violet',
        icon: <ShieldCheck size={22} />,
        title: 'รายงานสรุปงานเคลมประกัน',
        subtitle: 'ประวัติการส่งเคลมตามช่วงเวลา',
        description:
          'สรุปรายการส่งเคลมอุปกรณ์ตามประกัน สถานะการเคลม ผู้ดำเนินการ และสถานที่ของอุปกรณ์ที่ส่งเคลม',
        dateAware: true
      },
      {
        type: 'technician_workload',
        accent: '#0ea5e9',
        btnClass: 'btn-report-sky',
        icon: <UserCog size={22} />,
        title: 'รายงานสรุปภาระงานช่างซ่อม',
        subtitle: 'สถิติงานซ่อมแยกตามช่างแต่ละคน',
        description:
          'สรุปปริมาณงานของช่างแต่ละคน จำนวนงานทั้งหมด งานที่เสร็จสิ้น งานที่กำลังดำเนินการ และอัตราความสำเร็จของงาน',
        dateAware: true
      }
    ]
  },
  {
    key: 'stock',
    label: 'คลังพัสดุ',
    cards: [
      {
        type: 'inventory_summary',
        accent: '#3b82f6',
        btnClass: 'btn-report-blue',
        icon: <Boxes size={22} />,
        title: 'รายงานสรุปพัสดุคงคลังทั้งหมด',
        subtitle: 'ภาพรวมจำนวนพัสดุคงคลังทั้งหมด',
        description:
          'แสดงรายละเอียดปริมาณพัสดุอะไหล่ในสต็อก เกณฑ์ระดับความปลอดภัย สถานะภาพคงเหลือ และการตรวจนับพัสดุภาพรวมของระบบ',
        dateAware: false
      },
      {
        type: 'low_stock',
        accent: '#f59e0b',
        btnClass: 'btn-report-orange',
        icon: <Zap size={22} />,
        title: 'รายงานรายการพัสดุสต็อกต่ำ',
        subtitle: 'พัสดุที่วิกฤตต่ำกว่าเกณฑ์ความปลอดภัย',
        description:
          'สรุปข้อมูลสินค้าคงคลังที่ต่ำกว่าเกณฑ์ขั้นต่ำ (min_stock) เพื่อใช้พิจารณาดำเนินการสั่งจัดซื้อพัสดุเพิ่มเติม',
        dateAware: false
      },
      {
        type: 'transactions',
        accent: '#14b8a6',
        btnClass: 'btn-report-teal',
        icon: <ArrowLeftRight size={22} />,
        title: 'รายงานประวัติเคลื่อนไหวพัสดุ',
        subtitle: 'บัญชีรับ-จ่าย-ยืม-คืน ตามช่วงเวลา',
        description:
          'บันทึกการเคลื่อนไหวพัสดุทุกประเภท (รับเข้าคลัง เบิกออก ยืม และรับคืน) พร้อมจำนวน ผู้ทำรายการ และสถานที่',
        dateAware: true
      },
      {
        type: 'stock_count',
        accent: '#8b5cf6',
        btnClass: 'btn-report-violet',
        icon: <ClipboardCheck size={22} />,
        title: 'รายงานสรุปการตรวจนับสต็อก',
        subtitle: 'สรุปรอบตรวจนับและรายการที่พบผลต่าง',
        description:
          'สรุปรอบการตรวจนับสต็อกแต่ละครั้ง สถานะการตรวจนับ จำนวนรายการที่นับแล้ว และจำนวนรายการที่พบผลต่างจากยอดคงคลัง',
        dateAware: true
      }
    ]
  },
  {
    key: 'procure',
    label: 'จัดซื้อและเบิกจ่าย',
    cards: [
      {
        type: 'withdrawals',
        accent: '#10b981',
        btnClass: 'btn-report-green',
        icon: <PackageCheck size={22} />,
        title: 'รายงานประวัติเบิกจ่ายพัสดุ',
        subtitle: 'ติดตามประวัติการเบิกออกใช้งานของพนักงาน',
        description:
          'แสดงประวัติการเบิกสินค้าพัสดุไปใช้ โครงการที่ได้รับพัสดุ วันเวลาที่ส่งออกพัสดุ และชื่อของพนักงานผู้เบิกอุปกรณ์',
        dateAware: true
      },
      {
        type: 'purchase_orders',
        accent: '#6366f1',
        btnClass: 'btn-report-indigo',
        icon: <FileSignature size={22} />,
        title: 'รายงานประวัติจัดสั่งซื้อพัสดุ',
        subtitle: 'สรุปประวัติและสถานะการจัดสั่งซื้อ',
        description:
          'รายงานสรุปประวัติจัดสั่งซื้อพัสดุจากผู้ขาย สถานะการตรวจรับ รายละเอียดเลขใบสั่งซื้อ และจำนวนรายการที่ดำเนินการ',
        dateAware: true
      },
      {
        type: 'technician_stock',
        accent: '#f43f5e',
        btnClass: 'btn-report-rose',
        icon: <Truck size={22} />,
        title: 'รายงานอะไหล่ในมือช่าง',
        subtitle: 'บัญชีรับ-ติดตั้ง-คืน อะไหล่ประจำตัวช่าง',
        description:
          'บันทึกการเคลื่อนไหวอะไหล่ในชุดประจำตัวช่าง (รับเข้าชุด ติดตั้งหน้างาน และคืนคลัง) พร้อมช่าง สถานที่ และผู้ทำรายการ',
        dateAware: true
      },
      {
        type: 'pending_returns',
        accent: '#f59e0b',
        btnClass: 'btn-report-orange',
        icon: <Undo2 size={22} />,
        title: 'รายงานพัสดุยืม/เบิกค้างคืน',
        subtitle: 'รายการที่ยังไม่คืนและที่เกินกำหนด',
        description:
          'สรุปพัสดุที่ยืมหรือเบิกไปทดสอบ/สำรองใช้งานแล้วยังไม่นำส่งคืน แสดงจำนวนวันที่ค้าง กำหนดคืน และสถานะเกินกำหนด',
        dateAware: false
      }
    ]
  },
  {
    key: 'system',
    label: 'สินทรัพย์และระบบ',
    cards: [
      {
        type: 'asset_lifecycle',
        accent: '#6366f1',
        btnClass: 'btn-report-indigo',
        icon: <Activity size={22} />,
        title: 'รายงานวงจรชีวิตสินทรัพย์',
        subtitle: 'อุปกรณ์ที่ติดตั้งใช้งานตามสถานี',
        description:
          'สรุปสินทรัพย์ (S/N) ที่ติดตั้งใช้งานตามสถานี วันที่ติดตั้ง อายุการใช้งาน จำนวนครั้งที่เข้าซ่อม และสัญญาที่เกี่ยวข้อง',
        dateAware: false
      },
      {
        type: 'audit_log',
        accent: '#0ea5e9',
        btnClass: 'btn-report-sky',
        icon: <History size={22} />,
        title: 'รายงานบันทึกการใช้งานระบบ',
        subtitle: 'ประวัติการเปลี่ยนแปลงข้อมูลในระบบ',
        description:
          'บันทึกกิจกรรมการสร้าง แก้ไข และลบข้อมูลในระบบ พร้อมผู้ใช้งาน ประเภทข้อมูล และเวลาที่ดำเนินการ สำหรับการตรวจสอบย้อนหลัง',
        dateAware: true
      }
    ]
  }
];

const Reports: React.FC = () => {
  const { notify } = useNotification();
  const [loadingReport, setLoadingReport] = useState<ReportType | null>(null);

  // States for date range filters
  const [quickFilter, setQuickFilter] = useState<'all' | '30_days' | '3_months' | '1_year' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Live "found N rows" preview per report, refreshed when the date range changes.
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [countsLoading, setCountsLoading] = useState(false);

  // States to hold print templates data
  const [printData, setPrintData] = useState<{
    type: ReportType;
    title: string;
    dateStr: string;
    periodStr?: string;
    headers: string[];
    rows: (string | number)[][];
    totals?: { label: string; value: string }[];
    colWidths?: string[];
  } | null>(null);

  const toLocalYYYYMMDD = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleQuickFilterChange = (filterType: 'all' | '30_days' | '3_months' | '1_year' | 'custom') => {
    setQuickFilter(filterType);
    const end = new Date();
    if (filterType === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (filterType === '30_days') {
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setStartDate(toLocalYYYYMMDD(start));
      setEndDate(toLocalYYYYMMDD(end));
    } else if (filterType === '3_months') {
      const start = new Date();
      start.setMonth(end.getMonth() - 3);
      setStartDate(toLocalYYYYMMDD(start));
      setEndDate(toLocalYYYYMMDD(end));
    } else if (filterType === '1_year') {
      const start = new Date();
      start.setFullYear(end.getFullYear() - 1);
      setStartDate(toLocalYYYYMMDD(start));
      setEndDate(toLocalYYYYMMDD(end));
    } else if (filterType === 'custom') {
      if (!startDate) {
        const start = new Date();
        start.setMonth(end.getMonth() - 1);
        setStartDate(toLocalYYYYMMDD(start));
      }
      if (!endDate) {
        setEndDate(toLocalYYYYMMDD(end));
      }
    }
  };

  const handleDateChange = (field: 'start' | 'end', val: string) => {
    setQuickFilter('custom');
    if (field === 'start') {
      setStartDate(val);
    } else {
      setEndDate(val);
    }
  };

  // Refresh the per-report counts whenever the date range changes (debounced so
  // dragging the date picker doesn't fire a burst of requests).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setCountsLoading(true);
      try {
        const data = await reportApi.getCounts({
          startDate: startDate || undefined,
          endDate: endDate || undefined
        });
        if (!cancelled) setCounts(data);
      } catch {
        if (!cancelled) setCounts({});
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [startDate, endDate]);

  // Server-side report: returns fully formatted headers/rows ready for CSV/PDF.
  const fetchServerReport = async (type: ReportType): Promise<ServerReportPayload | null> => {
    setLoadingReport(type);
    try {
      return await reportApi.generate(type, {
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
    } catch {
      notify('ไม่สามารถดึงข้อมูลสำหรับออกรายงานได้', 'error');
      return null;
    } finally {
      setLoadingReport(null);
    }
  };

  const getCsvString = (headers: string[], rows: (string | number)[][]): string => {
    // UTF-8 BOM to prevent Thai garbled characters in Excel
    const BOM = '﻿';

    const escapeCsvCell = (val: string | number | null | undefined): string => {
      const str = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    };

    const headerLine = headers.map(escapeCsvCell).join(',');
    const rowLines = rows.map(row => row.map(escapeCsvCell).join(','));

    return BOM + [headerLine, ...rowLines].join('\n');
  };

  const downloadCsv = (csvStr: string, fileName: string) => {
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPeriodSuffix = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (startDate && endDate) {
      return `_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}`;
    }
    return `_${today}`;
  };

  const handleExportExcel = async (type: ReportType) => {
    const payload = await fetchServerReport(type);
    if (!payload) return;
    if (payload.count === 0) {
      notify('ไม่พบข้อมูลในช่วงเวลาที่เลือก', 'error');
      return;
    }
    const csvStr = getCsvString(payload.headers, payload.rows);
    downloadCsv(csvStr, `${type}${getPeriodSuffix()}`);
    notify('ส่งออกข้อมูล Excel (CSV) สำเร็จ');
  };

  const handlePrintPDF = async (type: ReportType) => {
    const payload = await fetchServerReport(type);
    if (!payload) return;
    if (payload.count === 0) {
      notify('ไม่พบข้อมูลในช่วงเวลาที่เลือก', 'error');
      return;
    }
    setPrintData({
      type,
      title: payload.title,
      dateStr: formatDateThai(new Date().toISOString()),
      periodStr: `ช่วงเวลา: ${payload.periodLabel}`,
      headers: payload.headers,
      rows: payload.rows,
      totals: payload.totals,
      colWidths: payload.colWidths
    });
    // Render the hidden template, then print.
    setTimeout(() => {
      printElement('report-print-container', payload.title);
    }, 400);
  };

  const getSelectedRangeLabel = () => {
    if (startDate && endDate) {
      return `${formatDateThai(startDate)} ถึง ${formatDateThai(endDate)}`;
    }
    if (startDate) {
      return `ตั้งแต่ ${formatDateThai(startDate)}`;
    }
    if (endDate) {
      return `จนถึง ${formatDateThai(endDate)}`;
    }
    return 'ข้อมูลทั้งหมด';
  };

  const renderCard = (cfg: CardConfig) => (
    <Card key={cfg.type} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: `4px solid ${cfg.accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ backgroundColor: `${cfg.accent}10`, color: cfg.accent, padding: '10px', borderRadius: '10px' }}>
          {cfg.icon}
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{cfg.title}</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cfg.subtitle}</span>
        </div>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, minHeight: '40px' }}>
        {cfg.description}
      </p>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-app)', padding: '6px 10px', borderRadius: '8px', marginTop: 'auto' }}>
        <span style={{ display: 'inline-block', width: '6px', height: '6px', backgroundColor: cfg.accent, borderRadius: '50%' }}></span>
        <span>{cfg.dateAware ? `ช่วงเวลาที่เลือก: ${getSelectedRangeLabel()}` : 'ข้อมูล ณ ปัจจุบัน (ไม่ขึ้นกับช่วงเวลา)'}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: countsLoading ? 'var(--text-muted)' : (counts[cfg.type] ? cfg.accent : 'var(--text-muted)'), whiteSpace: 'nowrap' }}>
          {countsLoading
            ? 'กำลังนับ…'
            : counts[cfg.type] === null || counts[cfg.type] === undefined
              ? ''
              : `พบ ${counts[cfg.type]} รายการ`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
        <Button
          variant="outline"
          disabled={loadingReport !== null}
          onClick={() => handleExportExcel(cfg.type)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}
        >
          {loadingReport === cfg.type ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
          ส่งออกไฟล์ Excel
        </Button>
        <Button
          disabled={loadingReport !== null}
          onClick={() => handlePrintPDF(cfg.type)}
          className={cfg.btnClass}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}
        >
          <Printer size={14} />
          พิมพ์ PDF (A4)
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="reports-page" style={{ padding: '2rem 2.5rem', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-title">
          <h2>รายงานสรุปสถิติสำหรับผู้บริหาร</h2>
          <p>ระบบออกเอกสารรายงาน พิมพ์ A4 PDF และดาวน์โหลดข้อมูลพัสดุในรูปแบบ Excel สำหรับส่งข้อมูลเสนอผู้บริหาร</p>
        </div>
      </div>

      {/* Date Filter Panel */}
      <Card style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)', color: '#3b82f6', padding: '8px', borderRadius: '8px' }}>
              <Calendar size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>เลือกช่วงเวลาของรายงาน</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>ใช้กับรายงานงานซ่อม เคลม เคลื่อนไหวพัสดุ เบิกจ่าย และใบสั่งซื้อ (รายงานคงคลังเป็นข้อมูลปัจจุบันเสมอ)</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-app)', padding: '4px', borderRadius: '10px' }}>
              {([
                { label: 'ทั้งหมด', value: 'all' },
                { label: '30 วันล่าสุด', value: '30_days' },
                { label: '3 เดือนล่าสุด', value: '3_months' },
                { label: '1 ปีล่าสุด', value: '1_year' },
                { label: 'กำหนดเอง', value: 'custom' }
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleQuickFilterChange(opt.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: quickFilter === opt.value ? 'var(--bg-card)' : 'transparent',
                    color: quickFilter === opt.value ? 'var(--text-main)' : 'var(--text-muted)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: quickFilter === opt.value ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Date Pickers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ตั้งแต่</span>
              <DatePicker
                value={startDate}
                onChange={(val) => handleDateChange('start', val)}
                placeholder="เริ่มวันที่"
              />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ถึง</span>
              <DatePicker
                value={endDate}
                onChange={(val) => handleDateChange('end', val)}
                placeholder="สิ้นสุดวันที่"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Report sections grouped by domain */}
      {REPORT_SECTIONS.map(section => (
        <div key={section.key} style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 1rem 2px' }}>
            {section.label}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {section.cards.map(renderCard)}
          </div>
        </div>
      ))}

      {/* --- Hidden Print Templates --- */}
      {printData && (() => {
        const headers = printData.headers;
        const colWidths = printData.colWidths ?? ((type: ReportType): string[] => {
          switch (type) {
            case 'inventory_summary':
            case 'low_stock':
              return ['10%', '25%', '20%', '15%', '15%', '15%'];
            case 'withdrawals':
              return ['10%', '15%', '15%', '30%', '20%', '10%'];
            case 'purchase_orders':
              return ['20%', '20%', '15%', '15%', '15%', '15%'];
            default:
              return [];
          }
        })(printData.type);

        // --- Weight-based pagination (mirrors withdrawal/PO templates) ---
        // 1 weight unit ≈ one single-line table row. Budgets are in these units.
        const rowWeight = (row: (string | number)[]): number => {
          const maxLines = Math.max(1, ...row.map((cell) => Math.ceil((String(cell).length || 1) / 22)));
          return 1 + (maxLines - 1) * 0.6;
        };
        const MIDDLE_PAGE_BUDGET = 26; // a page that carries the table only
        const LAST_PAGE_BUDGET = 19;   // final page must also leave room for totals + signatures

        type WRow = { row: (string | number)[]; weight: number };
        const sumWeight = (arr: WRow[]): number => arr.reduce((sum, x) => sum + x.weight, 0);
        const weighted: WRow[] = printData.rows.map((row) => ({ row, weight: rowWeight(row) }));
        const totalWeight = sumWeight(weighted);

        const pages: WRow[][] = [];
        if (weighted.length === 0 || totalWeight <= LAST_PAGE_BUDGET) {
          // Everything (plus the signature block) fits on one page
          pages.push(weighted);
        } else {
          let index = 0;
          while (index < weighted.length) {
            // If all remaining rows fit on a final page together with the signatures, stop here
            if (sumWeight(weighted.slice(index)) <= LAST_PAGE_BUDGET) {
              pages.push(weighted.slice(index));
              break;
            }
            // Otherwise fill a table-only page up to the (larger) middle-page budget
            const pageRows: WRow[] = [];
            let pageWeight = 0;
            while (index < weighted.length) {
              const next = weighted[index];
              if (pageWeight + next.weight > MIDDLE_PAGE_BUDGET && pageRows.length > 0) break;
              pageRows.push(next);
              pageWeight += next.weight;
              index++;
            }
            pages.push(pageRows);
          }
          // Safety net: if a table-only fill happened to swallow the final rows, the last
          // page now also carries the signatures and may be overfull — peel the excess
          // onto a fresh final page so signatures always have room.
          while (pages[pages.length - 1].length > 1 && sumWeight(pages[pages.length - 1]) > LAST_PAGE_BUDGET) {
            const last = pages[pages.length - 1];
            const moved: WRow[] = [];
            while (last.length > 1 && sumWeight(last) > LAST_PAGE_BUDGET) {
              moved.unshift(last.pop() as WRow);
            }
            pages.push(moved);
          }
        }
        const totalPages = pages.length;

        return (
          <div id="report-print-container" style={{ position: 'absolute', left: '-9999px', top: 0, width: '210mm', backgroundColor: 'white', boxSizing: 'border-box' }}>
            {pages.map((pageRows, pageIdx) => {
              const isLast = pageIdx === totalPages - 1;
              let startIndex = 0;
              for (let i = 0; i < pageIdx; i++) startIndex += pages[i].length;

              return (
                <div key={pageIdx} className="print-page" style={{ width: '210mm', minHeight: '297mm', backgroundColor: 'white', boxSizing: 'border-box', padding: '12mm', fontFamily: 'Sarabun, sans-serif', color: '#0f172a', position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  {/* Top Gradient Accent Band */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '6px',
                    backgroundImage: 'linear-gradient(90deg, #475569, #64748b)'
                  }} />

                  {/* Header section (Dashboard Style) */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '2px solid #e2e8f0',
                    paddingBottom: '10px',
                    marginTop: '4px'
                  }}>
                    <div>
                      <h1 style={{ color: '#0f172a', fontSize: '18px', margin: 0, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
                        CMA - ระบบซ่อมบำรุงและจัดสรรพัสดุกลาง
                      </h1>
                      <p style={{ margin: '3px 0 0 0', fontSize: '10.5px', color: '#475569', fontWeight: 700 }}>
                        ระบบบริหารจัดการงานซ่อมบำรุงและพัสดุอุปกรณ์
                      </p>
                      <p style={{ margin: '1px 0 0 0', fontSize: '8.5px', color: '#64748b' }}>
                        รายงานบริหารจัดการระบบอย่างเป็นทางการส่งคณะผู้บริหาร
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#0f172a',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        padding: '4px 12px',
                        borderRadius: '8px',
                        display: 'inline-block'
                      }}>
                        รายงานสรุปและสถิติ
                      </div>
                      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                        พิมพ์เมื่อ: {printData.dateStr}
                      </div>
                    </div>
                  </div>

                  {/* Document Title */}
                  <div style={{
                    textAlign: 'center',
                    margin: '6px 0',
                    padding: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '8px'
                  }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                      {printData.title.toUpperCase()}{pageIdx > 0 ? ' (ต่อ)' : ''}
                    </h3>
                    {printData.periodStr && (
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px', fontWeight: 700 }}>
                        ประจำช่วงเวลา: {printData.periodStr}
                      </div>
                    )}
                  </div>

                  {/* Table (Dashboard Card Style) */}
                  <div style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
                      <colgroup>
                        {colWidths.map((w, idx) => (
                          <col key={idx} style={{ width: w }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr style={{ backgroundColor: '#475569', color: '#ffffff' }}>
                          {headers.map((h, index) => (
                            <th
                              key={index}
                              style={{
                                padding: '6px 8px',
                                textAlign: index === 0 ? 'left' : (index === headers.length - 1 ? 'right' : 'center'),
                                fontWeight: 700,
                                fontSize: '11px',
                                wordWrap: 'break-word',
                                whiteSpace: 'normal',
                                overflowWrap: 'break-word'
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map(({ row }, localIdx) => {
                          const globalIdx = startIndex + localIdx;
                          return (
                            <tr
                              key={localIdx}
                              style={{
                                borderBottom: '1px solid #e2e8f0',
                                backgroundColor: globalIdx % 2 === 1 ? '#f8fafc' : 'transparent'
                              }}
                            >
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  style={{
                                    padding: '6px 8px',
                                    textAlign: cellIdx === 0 ? 'left' : (cellIdx === row.length - 1 ? 'right' : 'center'),
                                    color: cell === 'สินค้าหมด' || (typeof cell === 'string' && cell.startsWith('แนะนำให้สับเปลี่ยน')) ? '#ef4444' : cell === 'สต็อกต่ำกว่าเกณฑ์' ? '#f59e0b' : '#334155',
                                    fontWeight: cell === 'สินค้าหมด' || cell === 'สต็อกต่ำกว่าเกณฑ์' || (typeof cell === 'string' && cell.startsWith('แนะนำให้สับเปลี่ยน')) ? 700 : 'normal',
                                    wordWrap: 'break-word',
                                    whiteSpace: 'normal',
                                    overflowWrap: 'break-word'
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Spacer: pushes totals / signatures / footer to the bottom of the page */}
                  <div style={{ marginTop: 'auto' }} />

                  {/* Totals Summary — last page only */}
                  {isLast && printData.totals && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      marginTop: '4px',
                      padding: '8px 12px',
                      backgroundColor: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '8px',
                      width: 'fit-content',
                      alignSelf: 'flex-end',
                      minWidth: '240px',
                      boxSizing: 'border-box'
                    }}>
                      {printData.totals.map((total, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', fontWeight: 700, margin: '2px 0' }}>
                          <span style={{ color: '#475569' }}>{total.label}</span>
                          <span style={{ textAlign: 'right', color: '#0f172a', marginLeft: '24px' }}>{total.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Signatures (Stamp Boxes) — last page only */}
                  {isLast && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '12px',
                      borderTop: '1.5px solid #e2e8f0',
                      fontSize: '11px',
                      gap: '16px'
                    }}>
                      <div style={{
                        border: '1.5px dashed #cbd5e1',
                        borderRadius: '8px',
                        backgroundColor: '#fafafa',
                        padding: '10px',
                        textAlign: 'center',
                        flex: 1
                      }}>
                        <div style={{ borderBottom: '1px solid #94a3b8', width: '130px', margin: '2px auto 6px auto', height: '18px' }}></div>
                        <p style={{ margin: 0, fontWeight: 700 }}>ลงชื่อ ............................................</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#64748b' }}>( .......................................... )</p>
                        <div style={{ marginTop: '6px', fontWeight: 800, color: '#475569' }}>เจ้าหน้าที่คลังอุปกรณ์</div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>ผู้จัดทำรายงาน</div>
                        <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>วันที่: ....../……/……</div>
                      </div>

                      <div style={{
                        border: '1.5px dashed #cbd5e1',
                        borderRadius: '8px',
                        backgroundColor: '#fafafa',
                        padding: '10px',
                        textAlign: 'center',
                        flex: 1
                      }}>
                        <div style={{ borderBottom: '1px solid #94a3b8', width: '130px', margin: '2px auto 6px auto', height: '18px' }}></div>
                        <p style={{ margin: 0, fontWeight: 700 }}>ลงชื่อ ............................................</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#64748b' }}>( .......................................... )</p>
                        <div style={{ marginTop: '6px', fontWeight: 800, color: '#475569' }}>ผู้มีอำนาจอนุมัติ / ผู้บริหาร</div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>ผู้ตรวจทานและลงนาม</div>
                        <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>วันที่: ....../……/……</div>
                      </div>
                    </div>
                  )}

                  {/* Footer (every page) */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '8px',
                    color: '#94a3b8',
                    marginTop: '6px',
                    paddingTop: '4px',
                    borderTop: '1px solid #e2e8f0'
                  }}>
                    <span>ระบบบริหารสรุปสถิติออกรายงานโดยอัตโนมัติ CMA</span>
                    <span>หน้า {pageIdx + 1} / {totalPages} · Ref: CMA-RP-AUTO</span>
                  </div>

                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

export default Reports;
