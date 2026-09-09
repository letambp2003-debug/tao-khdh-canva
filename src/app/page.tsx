"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ApiKeyService } from '@/services/ai/api-key.service';
import type { MultiKeyTestResult } from '@/services/ai/ai.types';
import type { SourceDocument, SourceDocumentType, SourceReadinessReport } from '@/types/source-document';

const COMMANDS = [
  { id: 'KHOI_DONG', label: '🚀 Khởi động', desc: 'Lập chỉ mục nguồn & kiểm tra hệ thống' },
  { id: 'SOAN_XUAT', label: '✍️ Soạn xuất KHDH', desc: 'Soạn hoặc nâng cấp giáo án tự động' },
  { id: 'RA_SOAT_NHANH', label: '🔍 Rà soát nhanh (Delta QA)', desc: 'Kiểm tra lỗi và độ khớp nguồn' },
  { id: 'KIEM_TRA_TOAN', label: '📐 Kiểm tra Toán & OMML', desc: 'Chuẩn hóa công thức & Word Equation' },
  { id: 'TAO_SLIDE_NGHIEN_CUU', label: '📊 Tạo Slide nghiên cứu', desc: '15-20 slide chuẩn sư phạm mỗi tiết' },
  { id: 'XUAT_CANVA_PROMPT', label: '🎨 Xuất Canva Prompt', desc: 'Mã prompt độc lập cho từng slide' }
];

const DOC_TYPE_LABELS: Record<SourceDocumentType, { label: string; icon: string; badgeClass: string; desc: string }> = {
  PL1: {
    label: 'Phụ lục I',
    icon: '⭐',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    desc: 'Ưu tiên số 1: Danh mục bài, số tiết, YCCĐ, phân phối tiến trình.'
  },
  PPCT: {
    label: 'PPCT (Phân phối CT)',
    icon: '📘',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
    desc: 'Ưu tiên số 2: Thứ tự bài, số tiết, tuần học.'
  },
  SGK: {
    label: 'Sách giáo khoa (SGK)',
    icon: '📗',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    desc: 'Nguồn kiến thức môn học chính: Thuật ngữ, công thức, ví dụ chuẩn.'
  },
  KHDH_OLD: {
    label: 'KHDH cũ (Tham khảo)',
    icon: '📙',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    desc: 'Tài liệu tham khảo cấu trúc & hoạt động. Không ghi đè nguồn chính.'
  },
  OTHER: {
    label: 'Tài liệu khác',
    icon: '📄',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    desc: 'SBT, SGV, Phụ lục III, Khung năng lực số, Tài liệu địa phương...'
  }
};

interface OutputData {
  status: string;
  job_id: string;
  command: string;
  lesson_code: string;
  khdh_draft: string;
  token_usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
  duration_ms?: number;
  key_used?: string;
  sources_used?: { id: string; name: string; type: SourceDocumentType; version: number }[];
  source_readiness?: SourceReadinessReport;
}

export default function Home() {
  const [command, setCommand] = useState('SOAN_XUAT');
  const [lessonCode, setLessonCode] = useState('TOAN-8-HKI-SODAISO-C01-STT01');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'draft' | 'preview' | 'slide' | 'sources' | 'stats'>('draft');
  const [error, setError] = useState<string | null>(null);
  const [outputData, setOutputData] = useState<OutputData | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string>('');
  const [exportingWord, setExportingWord] = useState(false);
  const [showWordMenu, setShowWordMenu] = useState(false);

  // Multi-Key State
  const [showSettings, setShowSettings] = useState(false);
  const [rawKeysInput, setRawKeysInput] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [multiKeyResult, setMultiKeyResult] = useState<MultiKeyTestResult | null>(null);
  const [configuredKeyCount, setConfiguredKeyCount] = useState(0);

  // Source Documents State
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [readiness, setReadiness] = useState<SourceReadinessReport | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SourceDocument | null>(null);
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<{ id: string; displayName: string; documentType: SourceDocumentType } | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<SourceDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadTypeRef = useRef<SourceDocumentType | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load API keys & documents on mount
  useEffect(() => {
    const keys = ApiKeyService.getClientKeys();
    if (keys.length > 0) {
      setRawKeysInput(keys.join('\n'));
      setConfiguredKeyCount(keys.length);
    }
    fetchDocuments();
  }, []);

  const currentParsedKeys = ApiKeyService.parseKeys(rawKeysInput);

  const fetchDocuments = async () => {
    setDocLoading(true);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
        setReadiness(data.readiness || null);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setDocLoading(false);
    }
  };

  const handleTriggerUpload = (type?: SourceDocumentType) => {
    pendingUploadTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    if (pendingUploadTypeRef.current) {
      formData.append('documentType', pendingUploadTypeRef.current);
    }

    setDocLoading(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi tải tài liệu');
      }
      await fetchDocuments();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi tải tệp';
      setError(msg);
    } finally {
      setDocLoading(false);
      pendingUploadTypeRef.current = undefined;
    }
  };

  const handleTriggerReplace = (docId: string) => {
    setReplacingDocId(docId);
    if (replaceFileInputRef.current) {
      replaceFileInputRef.current.value = '';
      replaceFileInputRef.current.click();
    }
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !replacingDocId) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setDocLoading(true);
    try {
      const res = await fetch(`/api/documents/${replacingDocId}/replace`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi thay thế tài liệu');
      }
      await fetchDocuments();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi thay thế tệp';
      setError(msg);
    } finally {
      setDocLoading(false);
      setReplacingDocId(null);
    }
  };

  const handleToggleDocActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error toggling document:', err);
    }
  };

  const handleSaveDocEdit = async () => {
    if (!editingDoc) return;
    try {
      const res = await fetch(`/api/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editingDoc.displayName,
          documentType: editingDoc.documentType,
        }),
      });
      if (res.ok) {
        setEditingDoc(null);
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error updating document:', err);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteConfirmDoc(null);
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  const handleTestKeys = async () => {
    if (currentParsedKeys.length === 0) {
      setMultiKeyResult({
        success: false,
        totalKeys: 0,
        activeKeys: 0,
        message: 'Vui lòng nhập ít nhất 1 Google AI API Key để kiểm tra.',
        details: [],
      });
      return;
    }

    setTestingKey(true);
    setMultiKeyResult(null);

    try {
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeys: currentParsedKeys }),
      });

      const data: MultiKeyTestResult = await res.json();
      setMultiKeyResult(data);

      if (data.activeKeys > 0) {
        setConfiguredKeyCount(currentParsedKeys.length);
      }
    } catch {
      setMultiKeyResult({
        success: false,
        totalKeys: currentParsedKeys.length,
        activeKeys: 0,
        message: 'Không thể kết nối đến máy chủ kiểm tra API Key.',
        details: [],
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveSettings = () => {
    if (currentParsedKeys.length > 0) {
      ApiKeyService.saveClientKeys(currentParsedKeys, rememberKey);
      setConfiguredKeyCount(currentParsedKeys.length);
    } else {
      ApiKeyService.clearClientKeys();
      setConfiguredKeyCount(0);
    }
    setShowSettings(false);
  };

  const handleCommandClick = (cmdId: string) => {
    setCommand(cmdId);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!command.trim()) {
      setError('Vui lòng chọn hoặc nhập Lệnh (Command).');
      return;
    }

    setLoading(true);
    setError(null);
    setPipelineStep('Đang chuẩn bị căn cứ tài liệu nguồn & kết nối Google AI...');
    setOutputData(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const jobId = `JOB-${Date.now()}`;

      // Lấy danh sách ID các tài liệu đang Active & Ready
      const activeDocIds = documents.filter((d) => d.isActive && d.status === 'READY').map((d) => d.id);

      setPipelineStep('Đang điều phối Agent & thực thi (Bám sát căn cứ tài liệu nguồn & Xoay vòng Key)...');

      const res = await fetch('/api/generate-khdh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.trim(),
          lessonCode: lessonCode.trim(),
          jobId,
          apiKeys: activeKeys,
          documentIds: activeDocIds,
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Đã xảy ra lỗi trong quá trình xử lý.');
      }

      setOutputData(data);
      setPipelineStep('Hoàn tất!');
      setActiveTab('draft');
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj?.name === 'AbortError') {
        setError('Yêu cầu đã được bạn chủ động hủy.');
      } else {
        setError(errorObj?.message || 'Có lỗi không xác định xảy ra khi kết nối máy chủ.');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopy = () => {
    if (!outputData?.khdh_draft) return;
    navigator.clipboard.writeText(outputData.khdh_draft);
    alert('Đã sao chép nội dung vào Clipboard!');
  };

  
  const handleDownloadWord = async (
    mathMode: 'omml' | 'latex' = 'omml',
    printProfile: 'COMPACT_PRINT' | 'STANDARD' = 'COMPACT_PRINT'
  ) => {
    if (!outputData?.khdh_draft) return;

    setExportingWord(true);
    try {
      const res = await fetch('/api/export/word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: outputData.khdh_draft,
          title: 'Kế hoạch bài dạy',
          lessonCode: outputData.lesson_code || 'TOAN-8',
          mathMode,
          printProfile,
        }),
      });

      if (!res.ok) {
        throw new Error('Không thể tạo file Word. Vui lòng thử lại.');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const profileSuffix = printProfile === 'COMPACT_PRINT' ? 'COMPACT' : 'STD';
      let filename = `KHDH_${outputData.lesson_code || 'V10'}_${mathMode.toUpperCase()}_${profileSuffix}_${Date.now()}.docx`;
      
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Không thể tạo file Word. Vui lòng thử lại.';
      setError(msg);
    } finally {
      setExportingWord(false);
    }
  };

  const handleDownload = () => {
    if (!outputData?.khdh_draft) return;
    const blob = new Blob([outputData.khdh_draft], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KHDH_${outputData.lesson_code || 'V10'}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 font-sans">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUploadChange}
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md"
        className="hidden"
      />
      <input
        type="file"
        ref={replaceFileInputRef}
        onChange={handleReplaceFileChange}
        accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md"
        className="hidden"
      />

      {/* Header */}
      <header className="mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="bg-blue-700 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
              V10.1 FINAL
            </span>
            <h1 className="text-2xl font-black text-blue-800 tracking-tight">KHDH AUTO</h1>
          </div>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Trường THCS Quang Trung | Tổ Toán Tin | GV: Lê Tâm
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              configuredKeyCount > 1
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : configuredKeyCount === 1
                ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            }`}
          >
            <span>
              {configuredKeyCount > 1
                ? `🟢 ${configuredKeyCount} Keys (Luân phiên & Dự phòng)`
                : configuredKeyCount === 1
                ? '🟢 1 Key Đang Hoạt Động'
                : '🟡 Cấu Hình API Key'}
            </span>
            <span className="text-xs bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
              Quản lý
            </span>
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start justify-between gap-3 shadow-sm">
          <div className="flex gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold">Thông báo:</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700 text-lg leading-none font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION TÀI LIỆU NGUỒN (SOURCE DOCUMENTS MODULE) */}
      <section className="mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <span>📚</span> TÀI LIỆU NGUỒN
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Căn cứ pháp lý & học liệu chính thức cho AI biên soạn KHDH (Thứ tự ưu tiên: Phụ lục I &gt; PPCT &gt; SGK &gt; KHDH cũ)
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTriggerUpload('PL1')}
              disabled={docLoading}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <span>+</span> Bổ sung Phụ lục I
            </button>
            <button
              onClick={() => handleTriggerUpload('PPCT')}
              disabled={docLoading}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <span>+</span> Bổ sung PPCT
            </button>
            <button
              onClick={() => handleTriggerUpload('SGK')}
              disabled={docLoading}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <span>+</span> Bổ sung SGK_
            </button>
            <button
              onClick={() => handleTriggerUpload('KHDH_OLD')}
              disabled={docLoading}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <span>+</span> Bổ sung KHDH_ cũ
            </button>
            <button
              onClick={() => handleTriggerUpload('OTHER')}
              disabled={docLoading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <span>+</span> Thêm tài liệu khác
            </button>
          </div>
        </div>

        {/* Source Readiness Status Bar */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-700">Mức độ sẵn sàng nguồn:</span>
            
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold border ${
              readiness?.pl1Status === 'READY'
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-slate-200 text-slate-600 border-slate-300'
            }`}>
              <span>{readiness?.pl1Status === 'READY' ? '🟢' : '⚪'}</span>
              <span>Phụ lục I: {readiness?.pl1Status === 'READY' ? 'Sẵn sàng' : 'Chưa có'}</span>
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold border ${
              readiness?.ppctStatus === 'READY'
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-slate-200 text-slate-600 border-slate-300'
            }`}>
              <span>{readiness?.ppctStatus === 'READY' ? '🟢' : '⚪'}</span>
              <span>PPCT: {readiness?.ppctStatus === 'READY' ? 'Sẵn sàng' : 'Chưa có'}</span>
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold border ${
              readiness?.sgkStatus === 'READY'
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-slate-200 text-slate-600 border-slate-300'
            }`}>
              <span>{readiness?.sgkStatus === 'READY' ? '🟢' : '⚪'}</span>
              <span>SGK: {readiness?.sgkStatus === 'READY' ? 'Sẵn sàng' : 'Chưa có'}</span>
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold border ${
              readiness?.khdhOldStatus === 'READY'
                ? 'bg-purple-100 text-purple-900 border-purple-300'
                : 'bg-slate-200 text-slate-600 border-slate-300'
            }`}>
              <span>{readiness?.khdhOldStatus === 'READY' ? '🟣' : '⚪'}</span>
              <span>KHDH cũ: {readiness?.khdhOldStatus === 'READY' ? 'Có (Tham khảo)' : 'Chưa có'}</span>
            </span>
          </div>

          <div className="text-slate-500 text-xs italic">
            {readiness?.isSufficient 
              ? '✅ Đã đủ căn cứ tài liệu nguồn để thực thi tác vụ AI.'
              : '💡 Có thể bổ sung thêm tài liệu để tăng độ chính xác.'}
          </div>
        </div>

        {/* Document List / Empty State */}
        {docLoading && (
          <div className="p-6 text-center text-xs text-slate-500">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
            Đang xử lý tài liệu nguồn...
          </div>
        )}

        {!docLoading && documents.length === 0 && (
          <div className="p-8 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
            <span className="text-3xl">📂</span>
            <p className="font-semibold text-sm text-slate-700">Chưa có tài liệu nguồn.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Nhấn các nút phía trên hoặc kéo thả tệp (.pdf, .docx, .xlsx, .txt, .md) vào đây để nạp tài liệu làm căn cứ biên soạn.
            </p>
          </div>
        )}

        {!docLoading && documents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
            {documents.map((doc) => {
              const meta = DOC_TYPE_LABELS[doc.documentType] || DOC_TYPE_LABELS.OTHER;
              return (
                <div
                  key={doc.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${
                    doc.isActive && doc.status === 'READY'
                      ? 'bg-white border-slate-300 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 overflow-hidden">
                      <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="overflow-hidden">
                        <div className="font-bold text-sm text-slate-800 truncate" title={doc.displayName}>
                          {doc.displayName}
                        </div>
                        <div className="text-xs text-slate-500 truncate" title={doc.originalFileName}>
                          {doc.originalFileName}
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doc.isActive}
                        onChange={() => handleToggleDocActive(doc.id, doc.isActive)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{doc.isActive ? 'Sử dụng' : 'Tắt'}</span>
                    </label>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-bold border text-[11px] ${meta.badgeClass}`}>
                      {meta.label}
                    </span>

                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[11px] border border-slate-200">
                      v{doc.version}
                    </span>

                    <span className="text-slate-500 text-[11px]">
                      {(doc.fileSize / 1024).toFixed(1)} KB
                    </span>

                    <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                      doc.status === 'READY'
                        ? 'bg-emerald-50 text-emerald-700'
                        : doc.status === 'REPLACED'
                        ? 'bg-slate-100 text-slate-600'
                        : doc.status === 'ERROR'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {doc.status === 'READY'
                        ? '✓ Sẵn sàng'
                        : doc.status === 'REPLACED'
                        ? 'Đã thay thế'
                        : doc.status === 'ERROR'
                        ? 'Lỗi xử lý'
                        : 'Đang xử lý'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs gap-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2 py-1 text-slate-700 hover:bg-slate-100 rounded font-medium border border-slate-200 shadow-2xs"
                      >
                        👁️ Xem
                      </button>
                      <button
                        onClick={() => handleTriggerReplace(doc.id)}
                        className="px-2 py-1 text-blue-700 hover:bg-blue-50 rounded font-medium border border-blue-200 shadow-2xs"
                      >
                        🔄 Thay thế
                      </button>
                      <button
                        onClick={() =>
                          setEditingDoc({
                            id: doc.id,
                            displayName: doc.displayName,
                            documentType: doc.documentType,
                          })
                        }
                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded font-medium border border-slate-200"
                      >
                        ✏️ Sửa
                      </button>
                    </div>

                    <button
                      onClick={() => setDeleteConfirmDoc(doc)}
                      className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded font-medium border border-rose-200"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          <div className="card space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span>⚡</span> Bảng Điều Khiển Lệnh
            </h2>

            {/* Quick Command Chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Lệnh chuẩn V10.1:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {COMMANDS.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => handleCommandClick(cmd.id)}
                    disabled={loading}
                    className={`text-left p-2 rounded-lg border text-xs font-medium transition-all ${
                      command === cmd.id
                        ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">{cmd.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Command Input */}
            <div>
              <label htmlFor="cmd-input" className="block text-xs font-semibold text-slate-600 mb-1">
                Lệnh thực thi (Command):
              </label>
              <input
                id="cmd-input"
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={loading}
                className="input-field font-mono text-sm"
                placeholder="Ví dụ: SOAN_XUAT, KHOI_DONG..."
              />
            </div>

            {/* Lesson Code Input */}
            <div>
              <label htmlFor="lesson-input" className="block text-xs font-semibold text-slate-600 mb-1">
                Mã bài học / Tham số:
              </label>
              <textarea
                id="lesson-input"
                rows={3}
                value={lessonCode}
                onChange={(e) => setLessonCode(e.target.value)}
                disabled={loading}
                className="input-field text-sm"
                placeholder="Ví dụ: TOAN-8-HKI-SODAISO-C01-STT01 (Đơn thức và đa thức)"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => handleSubmit()}
                disabled={loading}
                className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    <span>{pipelineStep || 'Đang xử lý...'}</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Thực Thi Ngay</span>
                  </>
                )}
              </button>

              {loading && (
                <button
                  onClick={handleAbort}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-3 rounded-lg text-sm transition-all"
                >
                  Hủy
                </button>
              )}
            </div>
          </div>

          {/* System Info Card */}
          <div className="card text-xs text-slate-600 space-y-2 bg-slate-50/50">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>ℹ️</span> Thông tin cấu hình hệ thống
            </div>
            <div className="flex justify-between">
              <span>Mô hình ưu tiên:</span>
              <span className="font-semibold text-slate-800">Gemini Flash (Cascade Auto)</span>
            </div>
            <div className="flex justify-between">
              <span>Cơ chế API Key:</span>
              <span className="font-semibold text-blue-700">
                {configuredKeyCount > 1 ? `Multi-Key (${configuredKeyCount} keys xoay vòng)` : 'Single Key'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Căn cứ nguồn:</span>
              <span className="font-semibold text-slate-800">
                {documents.filter((d) => d.isActive && d.status === 'READY').length} tài liệu sẵn sàng
              </span>
            </div>
            <div className="flex justify-between">
              <span>Định dạng bảng:</span>
              <span className="font-semibold text-slate-800">2 cột (CV 5512)</span>
            </div>
            <div className="flex justify-between">
              <span>Công thức Toán:</span>
              <span className="font-semibold text-slate-800">LaTeX / KaTeX / OMML</span>
            </div>
          </div>
        </div>

        {/* Right Output Area (8 cols) */}
        <div className="lg:col-span-8">
          <div className="card p-0 overflow-hidden flex flex-col h-full min-h-[600px]">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1">
              {[
                { id: 'draft', label: '📝 Bản Thảo KHDH' },
                { id: 'preview', label: '📐 Xem Trước 2 Cột' },
                { id: 'slide', label: '📊 Slide & Canva' },
                { id: 'sources', label: '📚 Nguồn Sử Dụng' },
                { id: 'stats', label: '📈 Thống Kê & Key' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'draft' | 'preview' | 'slide' | 'sources' | 'stats')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="flex-1 p-5 overflow-auto max-h-[680px]">
              {loading && (
                <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
                  <div>
                    <p className="font-bold text-slate-800">{pipelineStep}</p>
                    <p className="text-xs text-slate-500 mt-1">Đang sử dụng Google AI Gemini để tạo nội dung...</p>
                  </div>
                </div>
              )}

              {!loading && !outputData && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-center space-y-2">
                  <span className="text-4xl">📋</span>
                  <p className="font-medium text-sm text-slate-600">Chưa có dữ liệu giáo án.</p>
                  <p className="text-xs text-slate-400">Chọn lệnh và nhấn &quot;Thực Thi Ngay&quot; để tạo Kế hoạch bài dạy.</p>
                </div>
              )}

              {!loading && outputData && (
                <>
                  {activeTab === 'draft' && (
                    <div className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      {outputData.khdh_draft}
                    </div>
                  )}

                  {activeTab === 'preview' && (
                    <div className="space-y-4 text-sm leading-relaxed">
                      <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
                        <div className="font-bold text-blue-900">TRƯỜNG THCS QUANG TRUNG | TỔ TOÁN TIN</div>
                        <div className="text-xs text-blue-700 mt-0.5">Giáo viên: Lê Tâm | Năm học 2026-2027</div>
                      </div>
                      <div className="font-mono text-xs whitespace-pre-wrap bg-white p-4 border rounded-xl">
                        {outputData.khdh_draft}
                      </div>
                    </div>
                  )}

                  {activeTab === 'slide' && (
                    <div className="space-y-4">
                      <div className="p-3 bg-amber-50 text-amber-900 rounded-lg text-xs font-medium border border-amber-200">
                        💡 Mỗi tiết học tạo 1 deck gồm 15-20 slide với Canva Prompt độc lập.
                      </div>
                      <div className="font-mono text-xs whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border">
                        {outputData.khdh_draft.includes('[CANVA_SLIDE_PROMPT]')
                          ? outputData.khdh_draft
                          : 'Để xem Canva prompt chi tiết, hãy chạy lệnh XUAT_CANVA_PROMPT hoặc SOAN_XUAT_CANVA.'}
                      </div>
                    </div>
                  )}

                  {activeTab === 'sources' && (
                    <div className="space-y-4 text-xs">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>📚</span> Danh sách căn cứ tài liệu nguồn đã được AI sử dụng:
                        </p>
                      </div>

                      {outputData.sources_used && outputData.sources_used.length > 0 ? (
                        <div className="space-y-2">
                          {outputData.sources_used.map((s, idx) => {
                            const meta = DOC_TYPE_LABELS[s.type] || DOC_TYPE_LABELS.OTHER;
                            return (
                              <div
                                key={idx}
                                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <span>{meta.icon}</span>
                                  <div>
                                    <div className="font-bold text-slate-800">{s.name}</div>
                                    <div className="text-slate-500 text-[11px]">{meta.desc}</div>
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded font-bold text-xs border ${meta.badgeClass}`}>
                                  v{s.version}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl border">
                          Chưa có tài liệu nguồn nào được tải lên cho lần tạo này (dùng chuẩn mặc định 5512).
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'stats' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-50 border rounded-xl">
                          <span className="text-slate-500 block">Input Tokens:</span>
                          <span className="text-base font-bold text-slate-800">
                            {outputData.token_usage?.inputTokens || 0}
                          </span>
                        </div>
                        <div className="p-3 bg-slate-50 border rounded-xl">
                          <span className="text-slate-500 block">Output Tokens:</span>
                          <span className="text-base font-bold text-slate-800">
                            {outputData.token_usage?.outputTokens || 0}
                          </span>
                        </div>
                        <div className="p-3 bg-slate-50 border rounded-xl">
                          <span className="text-slate-500 block">Tổng Token:</span>
                          <span className="text-base font-bold text-blue-700">
                            {outputData.token_usage?.totalTokens || 0}
                          </span>
                        </div>
                        <div className="p-3 bg-slate-50 border rounded-xl">
                          <span className="text-slate-500 block">Thời gian xử lý:</span>
                          <span className="text-base font-bold text-slate-800">
                            {((outputData.duration_ms || 0) / 1000).toFixed(2)}s
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                        <div><span className="font-semibold">Mã Job:</span> {outputData.job_id}</div>
                        <div><span className="font-semibold">Mô hình AI:</span> {outputData.model}</div>
                        <div><span className="font-semibold">Key đã sử dụng:</span> <code className="bg-slate-200 px-1.5 py-0.5 rounded font-bold text-slate-700">{outputData.key_used || 'Mặc định'}</code></div>
                        <div><span className="font-semibold">Lệnh thực thi:</span> {outputData.command}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom Toolbar */}
            {outputData && (
              <div className="border-t border-slate-200 bg-slate-50 p-3 px-5 flex flex-wrap justify-between items-center gap-3">
                <span className="text-xs text-slate-500">
                  Job ID: <code className="font-semibold">{outputData.job_id}</code>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <span>📋</span> Sao chép Markdown
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-all shadow-2xs"
                  >
                    <span>⬇️</span> Tải file (.md)
                  </button>

                  {/* Word Download Dropdown */}
                  <div className="relative inline-block text-left">
                    <button
                      onClick={() => setShowWordMenu(!showWordMenu)}
                      disabled={exportingWord}
                      className="btn-primary text-xs flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-3.5 rounded-lg shadow-sm transition-all"
                    >
                      {exportingWord ? (
                        <>
                          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                          <span>Đang tạo Word...</span>
                        </>
                      ) : (
                        <>
                          <span>📥</span>
                          <span>Tải xuống Word ▼</span>
                        </>
                      )}
                    </button>

                    {showWordMenu && !exportingWord && (
                      <div className="absolute right-0 bottom-full mb-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-2 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                          Tùy chọn xuất Word (.docx)
                        </div>

                        {/* Option 1: Compact Print OMML (Default) */}
                        <button
                          onClick={() => {
                            setShowWordMenu(false);
                            handleDownloadWord('omml', 'COMPACT_PRINT');
                          }}
                          className="w-full text-left p-2.5 hover:bg-blue-50/80 rounded-xl transition-all flex flex-col gap-0.5 group border border-transparent hover:border-blue-200 bg-blue-50/40"
                        >
                          <div className="font-bold text-blue-900 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span>🖨️</span> Word OMML – Tiết kiệm in
                            </span>
                            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-bold">Mặc định</span>
                          </div>
                          <p className="text-[11px] text-slate-600 group-hover:text-blue-800 leading-snug mt-0.5">
                            Font 13pt, lề gọn 15-20mm, giãn dòng 1.05, tối ưu trang &amp; mực in đen trắng
                          </p>
                        </button>

                        {/* Option 2: Standard OMML */}
                        <button
                          onClick={() => {
                            setShowWordMenu(false);
                            handleDownloadWord('omml', 'STANDARD');
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl transition-all flex flex-col gap-0.5 group border border-transparent hover:border-slate-200"
                        >
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>📄</span> Word OMML – Tiêu chuẩn
                          </div>
                          <p className="text-[11px] text-slate-500 group-hover:text-slate-700 leading-snug mt-0.5">
                            Font 14pt, lề chuẩn 20-25mm, giãn dòng 1.15 rộng rãi, công thức Equation
                          </p>
                        </button>

                        {/* Option 3: LaTeX Raw Mode */}
                        <button
                          onClick={() => {
                            setShowWordMenu(false);
                            handleDownloadWord('latex', 'COMPACT_PRINT');
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-50 rounded-xl transition-all flex flex-col gap-0.5 group border border-transparent hover:border-slate-200"
                        >
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>📐</span> Word giữ công thức LaTeX
                          </div>
                          <p className="text-[11px] text-slate-500 group-hover:text-slate-700 leading-snug mt-0.5">
                            Giữ nguyên mã nguồn $...$ để dễ copy và tái sử dụng
                          </p>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Multi-Key Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span>🔐</span> Cấu Hình Danh Sách Google AI API Keys
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hỗ trợ nhập nhiều key – tự động xoay vòng và dự phòng khi hết hạn mức
                </p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <span>💡</span> Mẹo sử dụng Multi-Key:
                </p>
                <p>
                  Bạn có thể dán <strong>nhiều API Keys</strong> (mỗi key trên 1 dòng hoặc cách nhau bằng dấu phẩy). Hệ thống sẽ tự động luân phiên (Round-Robin) và tự chuyển sang Key tiếp theo nếu Key trước hết Quota trong ngày.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">
                    Danh sách Google AI API Keys:
                  </label>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {currentParsedKeys.length} Key hợp lệ
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={rawKeysInput}
                  onChange={(e) => setRawKeysInput(e.target.value)}
                  placeholder={`AIzaSyKey1...\nAIzaSyKey2...\nAIzaSyKey3...`}
                  className="input-field font-mono text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="remember-key"
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="remember-key" className="text-slate-700 font-medium cursor-pointer">
                  Ghi nhớ danh sách key trên thiết bị này (localStorage)
                </label>
              </div>

              {/* Multi-Key Test Results */}
              {multiKeyResult && (
                <div className="space-y-2 pt-2 border-t">
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold ${
                      multiKeyResult.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {multiKeyResult.message}
                  </div>

                  {multiKeyResult.details.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {multiKeyResult.details.map((d, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span>
                              {d.status === 'ACTIVE'
                                ? '🟢'
                                : d.status === 'QUOTA_EXHAUSTED'
                                ? '🟡'
                                : '🔴'}
                            </span>
                            <span className="font-mono font-bold text-slate-800">
                              {d.maskedKey}
                            </span>
                          </div>
                          <span
                            className={`text-xs ${
                              d.status === 'ACTIVE'
                                ? 'text-emerald-700 font-medium'
                                : d.status === 'QUOTA_EXHAUSTED'
                                ? 'text-amber-700 font-medium'
                                : 'text-rose-700 font-medium'
                            }`}
                          >
                            {d.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4 gap-2">
              <button
                onClick={handleTestKeys}
                disabled={testingKey || currentParsedKeys.length === 0}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                {testingKey ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-slate-600 border-t-transparent rounded-full" />
                    <span>Đang kiểm tra {currentParsedKeys.length} keys...</span>
                  </>
                ) : (
                  <>
                    <span>🔍</span>
                    <span>Kiểm tra tất cả Key</span>
                  </>
                )}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="btn-primary text-xs"
                >
                  Lưu & Áp Dụng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-2xl w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{DOC_TYPE_LABELS[previewDoc.documentType]?.icon || '📄'}</span>
                <div>
                  <h3 className="text-base font-bold text-slate-800 truncate">{previewDoc.displayName}</h3>
                  <p className="text-xs text-slate-500">{previewDoc.originalFileName} (Phiên bản v{previewDoc.version})</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div><span className="font-semibold">Phân loại:</span> {DOC_TYPE_LABELS[previewDoc.documentType]?.label}</div>
                <div><span className="font-semibold">Dung lượng:</span> {(previewDoc.fileSize / 1024).toFixed(1)} KB</div>
                <div><span className="font-semibold">Ngày nạp:</span> {new Date(previewDoc.createdAt).toLocaleString('vi-VN')}</div>
                <div><span className="font-semibold">Trạng thái:</span> {previewDoc.status}</div>
                <div><span className="font-semibold">Tóm tắt:</span> {previewDoc.contentSummary}</div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Nội dung văn bản trích xuất:</label>
                <div className="font-mono text-xs whitespace-pre-wrap bg-slate-900 text-slate-100 p-4 rounded-xl max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                  {previewDoc.extractedText || 'Chưa có nội dung văn bản trích xuất.'}
                </div>
              </div>
            </div>

            <div className="border-t pt-3 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setPreviewDoc(null)}
                className="btn-primary text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span>✏️</span> Chỉnh Sửa Thông Tin Tài Liệu Nguồn
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên hiển thị:</label>
                <input
                  type="text"
                  value={editingDoc.displayName}
                  onChange={(e) => setEditingDoc({ ...editingDoc, displayName: e.target.value })}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phân loại tài liệu:</label>
                <select
                  value={editingDoc.documentType}
                  onChange={(e) => setEditingDoc({ ...editingDoc, documentType: e.target.value as SourceDocumentType })}
                  className="input-field text-xs"
                >
                  <option value="PL1">⭐ Phụ lục I hiện hành (Ưu tiên 1)</option>
                  <option value="PPCT">📘 PPCT - Phân phối chương trình (Ưu tiên 2)</option>
                  <option value="SGK">📗 Sách giáo khoa - SGK (Kiến thức chính)</option>
                  <option value="KHDH_OLD">📙 KHDH cũ (Tài liệu tham khảo)</option>
                  <option value="OTHER">📄 Tài liệu khác (SBT, SGV, Phụ lục III...)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                onClick={() => setEditingDoc(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveDocEdit}
                className="btn-primary text-xs"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-rose-800 flex items-center gap-2">
              <span>⚠️</span> Xác Nhận Xóa Tài Liệu
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa tài liệu <strong>&quot;{deleteConfirmDoc.displayName}&quot;</strong> không?
              {deleteConfirmDoc.isActive && (
                <span className="block mt-1 text-amber-700 font-semibold">
                  Tài liệu này đang được kích hoạt để phục vụ biên soạn KHDH AI.
                </span>
              )}
            </p>

            <div className="flex justify-end gap-2 border-t pt-3">
              <button
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteDocument(deleteConfirmDoc.id)}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
