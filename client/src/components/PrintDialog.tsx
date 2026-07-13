import React, { useEffect, useState, useCallback } from 'react';
import { Button } from './ui/Button';
import AppDialog from './ui/AppDialog';
import { settingsApi, UPLOAD_URL } from '../api';
import Select from './ui/Select';
import { printElement } from '../utils/pdfGenerator';
import { useNotification } from './Layout';
import type { Company, CompanyLogo } from '../types';
import { Printer, X, Building2, Image as ImageIcon, Loader2, Eye } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Element id of the rendered template (e.g. "pdf-withdrawal-template") */
  templateId: string;
  /** Window title shown on the printed page */
  docTitle: string;
  /**
   * Render the actual template component, given the user's selected company + logo.
   * The dialog will mount this element (hidden) and call printElement on it.
   */
  renderTemplate: (company: Company | null, logo: CompanyLogo | null) => React.ReactNode;
  onBeforePrint?: (companyId: number, logoId: number) => Promise<void> | void;
}

/**
 * Universal print dialog: lets the user pick which company + which logo
 * to print with, then triggers printElement on the chosen template.
 */
export const PrintDialog: React.FC<Props> = ({ open, onClose, templateId, docTitle, renderTemplate, onBeforePrint }) => {
  const { notify } = useNotification();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [logos, setLogos] = useState<CompanyLogo[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedLogoId, setSelectedLogoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Load companies when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const list = await settingsApi.getCompanies();
        if (cancelled) return;
        setCompanies(list);
        const defaultCompany = list.find((c) => c.is_default === 1) || list[0];
        if (defaultCompany) {
          setSelectedCompanyId(defaultCompany.id);
        } else {
          setSelectedCompanyId(-1);
        }
      } catch {
        if (!cancelled) notify('ไม่สามารถโหลดข้อมูลบริษัทได้', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, notify]);

  // Load logos when selected company changes
  useEffect(() => {
    if (!selectedCompanyId || selectedCompanyId === -1) {
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const list = await settingsApi.getLogos(selectedCompanyId);
        if (cancelled) return;
        setLogos(list);
        const defaultLogo = list.find((l) => l.is_default === 1) || list[0] || null;
        setSelectedLogoId(defaultLogo ? defaultLogo.id : null);
      } catch {
        if (!cancelled) notify('ไม่สามารถโหลดโลโก้ได้', 'error');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedCompanyId, notify]);

  const handlePrint = useCallback(async () => {
    if (selectedCompanyId === null) {
      notify('กรุณาเลือกบริษัท', 'error');
      return;
    }
    setPrinting(true);

    if (onBeforePrint) {
      try {
        await onBeforePrint(selectedCompanyId === -1 ? 0 : selectedCompanyId, selectedLogoId ?? 0);
      } catch (err) {
        console.error('onBeforePrint error:', err);
      }
    }

    // Give the template a moment to re-render with the chosen company/logo
    setTimeout(() => {
      printElement(templateId, docTitle);
      setTimeout(() => {
        setPrinting(false);
        onClose();
      }, 600);
    }, 400);
  }, [selectedCompanyId, selectedLogoId, templateId, docTitle, notify, onClose, onBeforePrint]);

  if (!open) return null;

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const selectedLogo = logos.find((l) => l.id === selectedLogoId) || null;

  return (
    <>
      {/* Hidden template — always rendered while dialog is open so printElement can find it */}
      <div style={{ position: 'absolute', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        {renderTemplate(selectedCompany ?? null, selectedLogo)}
      </div>

      <AppDialog
        isOpen={open}
        onClose={onClose}
        title="พิมพ์เอกสาร"
        busy={printing}
        className="modal-content"
        panelStyle={{
          borderRadius: '16px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Printer size={22} color="var(--primary)" />
              พิมพ์เอกสาร
            </h3>
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              disabled={printing}
              aria-label="ปิดหน้าต่างพิมพ์"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={22} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={28} className="spinner" />
                <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>กำลังโหลด...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Company picker */}
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    marginBottom: '8px',
                    color: 'var(--text-main)',
                  }}>
                    <Building2 size={14} color="var(--primary)" />
                    ออกในนามบริษัท
                  </label>
                  <Select
                    value={selectedCompanyId ?? -1}
                    options={[
                      { label: 'ไม่ระบุบริษัท (ใช้หัวเอกสารระบบทั่วไป)', value: -1 },
                      ...companies.map((c) => ({
                        label: `${c.name_th}${c.is_default === 1 ? ' (หลัก)' : ''}`,
                        value: c.id
                      }))
                    ]}
                    onChange={(val) => {
                      const cid = Number(val);
                      setSelectedCompanyId(cid);
                      if (cid === -1) {
                        setLogos([]);
                        setSelectedLogoId(null);
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                  {selectedCompany && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      background: 'var(--bg-app)',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}>
                      {selectedCompany.name_en && <div style={{ fontWeight: 600 }}>{selectedCompany.name_en}</div>}
                      {selectedCompany.address && <div>{selectedCompany.address}</div>}
                      {selectedCompany.phone && <div>โทร. {selectedCompany.phone}</div>}
                    </div>
                  )}
                  {companies.length === 0 && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic'
                    }}>
                      💡 คุณสามารถเพิ่มข้อมูลบริษัทและโลโก้ได้ที่หน้า "ตั้งค่าระบบ" เพื่อใช้พิมพ์หัวเอกสารองค์กร
                    </div>
                  )}
                </div>

                {/* Logo picker */}
                {selectedCompanyId !== null && selectedCompanyId !== -1 && companies.length > 0 && (
                  <div>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      marginBottom: '8px',
                      color: 'var(--text-main)',
                    }}>
                      <ImageIcon size={14} color="var(--primary)" />
                      โลโก้ที่ใช้บนเอกสาร
                    </label>

                    {logos.length === 0 ? (
                      <div style={{
                        padding: '12px',
                        background: 'var(--bg-app)',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                      }}>
                        ⚠️ บริษัทนี้ยังไม่มีโลโก้ — สามารถปริ้นได้แต่จะไม่มีโลโก้บนเอกสาร
                      </div>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '8px',
                      }}>
                        {logos.map((logo) => {
                          const isSelected = logo.id === selectedLogoId;
                          return (
                            <button
                              key={logo.id}
                              type="button"
                              onClick={() => setSelectedLogoId(logo.id)}
                              style={{
                                padding: '6px',
                                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                borderRadius: '8px',
                                background: isSelected ? 'var(--primary-light)' : 'var(--bg-card)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s',
                              }}
                            >
                              <div style={{
                                width: '100%',
                                height: '70px',
                                background: 'var(--bg-app)',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px',
                              }}>
                                <img
                                  src={`${UPLOAD_URL}/uploads/${logo.file_path}`}
                                  alt={logo.label}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                              </div>
                              <div style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                                textAlign: 'center',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {isSelected ? '✓ ' : ''}{logo.label}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Preview hint */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  background: 'var(--bg-app)',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                }}>
                  <Eye size={14} />
                  <span>เอกสารจะแสดงตัวอย่างในแท็บใหม่ก่อนสั่งพิมพ์ — คุณสามารถยกเลิกได้ที่ขั้นตอนพิมพ์</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}>
            <Button variant="outline" onClick={onClose} disabled={printing}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              icon={<Printer size={16} />}
              onClick={handlePrint}
              loading={printing}
              disabled={selectedCompanyId === null}
            >
              พิมพ์เอกสาร
            </Button>
          </div>
      </AppDialog>

    </>
  );
};

export default PrintDialog;
