"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ApiKeyService } from '@/services/ai/api-key.service';
import type { MultiKeyTestResult } from '@/services/ai/ai.types';
import type { SourceDocument, SourceDocumentType, SourceReadinessReport } from '@/types/source-document';
import type {
  VideoStoryboardData,
  VideoStyleId,
  VideoGenreId,
} from '@/types/video-storyboard.types';
import {
  VIDEO_STYLES,
  VIDEO_GENRES,
  SCENE_COUNT_OPTIONS,
} from '@/types/video-storyboard.types';
import type { LessonRequirementAnalysis } from '@/types/lesson-analysis.types';

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
  const [activeTab, setActiveTab] = useState<'draft' | 'preview' | 'worksheet' | 'game' | 'storyboard' | 'slide' | 'sources' | 'stats'>('draft');
  const [error, setError] = useState<string | null>(null);
  const [outputData, setOutputData] = useState<OutputData | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string>('');
  const [exportingWord, setExportingWord] = useState(false);
  const [showWordMenu, setShowWordMenu] = useState(false);

  // Worksheet State
  const [worksheetMarkdown, setWorksheetMarkdown] = useState<string | null>(null);
  const [generatingWorksheet, setGeneratingWorksheet] = useState(false);
  const [exportingWorksheetWord, setExportingWorksheetWord] = useState(false);

  // Interactive HTML Game State
  const [gameHtml, setGameHtml] = useState<string | null>(null);
  const [generatingGame, setGeneratingGame] = useState(false);
  const [selectedGameTemplate, setSelectedGameTemplate] = useState<'SPACE_QUIZ' | 'LUCKY_WHEEL' | 'MEMORY_MATCH'>('SPACE_QUIZ');

  // Video Storyboard State (Google Flow 8s Config)
  const [storyboardData, setStoryboardData] = useState<VideoStoryboardData | null>(null);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [selectedVideoStyle, setSelectedVideoStyle] = useState<VideoStyleId>('PIXAR_3D');
  const [selectedVideoGenre, setSelectedVideoGenre] = useState<VideoGenreId>('CONCEPT_EXPLORATION');
  const [selectedNumScenes8s, setSelectedNumScenes8s] = useState<number>(5);

  // Lesson Requirement Analysis & Locked Configuration State
  const [lessonAnalysis, setLessonAnalysis] = useState<LessonRequirementAnalysis | null>(null);
  const [analyzingLesson, setAnalyzingLesson] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [isConfigLocked, setIsConfigLocked] = useState(false);

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

  const handleAnalyzeLesson = async () => {
    if (!lessonCode.trim()) {
      setError('Vui lòng nhập Mã bài học hoặc Tên bài cần phân tích.');
      return;
    }

    setAnalyzingLesson(true);
    setError(null);

    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const activeDocIds = documents.filter((d) => d.isActive && d.status === 'READY').map((d) => d.id);

      const res = await fetch('/api/analyze-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonCode: lessonCode.trim(),
          command: command.trim(),
          apiKeys: activeKeys,
          documentIds: activeDocIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể phân tích yêu cầu bài học.');
      }

      setLessonAnalysis(data.analysis);
      setShowAnalysisModal(true);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi khi phân tích yêu cầu bài học.';
      setError(msg);
    } finally {
      setAnalyzingLesson(false);
    }
  };

  const handleLockConfig = (executeImmediately: boolean = false) => {
    if (!lessonAnalysis) return;
    setIsConfigLocked(true);
    setShowAnalysisModal(false);
    if (executeImmediately) {
      handleSubmit(undefined, lessonAnalysis);
    }
  };

  const handleUnlockConfig = () => {
    setIsConfigLocked(false);
  };

  const handleSubmit = async (e?: React.FormEvent, configOverride?: LessonRequirementAnalysis) => {
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

      const targetConfig = configOverride || (isConfigLocked ? lessonAnalysis : undefined);

      const res = await fetch('/api/generate-khdh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.trim(),
          lessonCode: targetConfig?.lessonTitle || lessonCode.trim(),
          jobId,
          apiKeys: activeKeys,
          documentIds: activeDocIds,
          lockedConfig: targetConfig,
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
        let errMessage = 'Không thể tạo file Word. Vui lòng thử lại.';
        try {
          const errData = await res.json();
          if (errData?.message) errMessage = errData.message;
        } catch {}
        throw new Error(errMessage);
      }

      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const errData = await res.json();
        throw new Error(errData?.message || 'Lỗi xử lý file Word.');
      }

      const blob = await res.blob();
      const docxBlob = new Blob([blob], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const profileSuffix = printProfile === 'COMPACT_PRINT' ? 'COMPACT' : 'STD';
      let filename = `KHDH_${outputData.lesson_code || 'V10'}_${mathMode.toUpperCase()}_${profileSuffix}_${Date.now()}.docx`;
      
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }

      const url = URL.createObjectURL(docxBlob);
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

  const handleGenerateWorksheet = async () => {
    if (!outputData?.khdh_draft) return;
    setGeneratingWorksheet(true);
    setError(null);
    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const res = await fetch('/api/generate-worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          khdhDraft: outputData.khdh_draft,
          lessonCode: outputData.lesson_code,
          apiKeys: activeKeys,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo Phiếu học tập.');
      }

      setWorksheetMarkdown(data.markdown);
      setActiveTab('worksheet');
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi khi tạo Phiếu học tập.';
      setError(msg);
    } finally {
      setGeneratingWorksheet(false);
    }
  };

  const handleDownloadWorksheetWord = async () => {
    if (!worksheetMarkdown) return;
    setExportingWorksheetWord(true);
    try {
      const res = await fetch('/api/export/worksheet-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: worksheetMarkdown,
          lessonCode: outputData?.lesson_code || 'TOAN-8',
        }),
      });

      if (!res.ok) {
        throw new Error('Không thể xuất file Word Phiếu học tập.');
      }

      const blob = await res.blob();
      const docxBlob = new Blob([blob], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const url = URL.createObjectURL(docxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PHT_${outputData?.lesson_code || 'TOAN-8'}_IN_AN_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi tải Word Phiếu học tập.';
      setError(msg);
    } finally {
      setExportingWorksheetWord(false);
    }
  };

  const handleCopyWorksheet = () => {
    if (!worksheetMarkdown) return;
    navigator.clipboard.writeText(worksheetMarkdown);
    alert('Đã sao chép nội dung Phiếu học tập vào Clipboard!');
  };

  const handleGenerateGame = async (templateOverride?: 'SPACE_QUIZ' | 'LUCKY_WHEEL' | 'MEMORY_MATCH') => {
    if (!outputData?.khdh_draft) return;
    const targetTemplate = templateOverride || selectedGameTemplate;
    setGeneratingGame(true);
    setError(null);
    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const res = await fetch('/api/generate-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          khdhDraft: outputData.khdh_draft,
          lessonCode: outputData.lesson_code,
          templateId: targetTemplate,
          apiKeys: activeKeys,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo Trò chơi tương tác.');
      }

      setGameHtml(data.html);
      setActiveTab('game');
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi khi tạo Trò chơi.';
      setError(msg);
    } finally {
      setGeneratingGame(false);
    }
  };

  const handleDownloadGameHtml = () => {
    if (!gameHtml) return;
    const blob = new Blob([gameHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GAME_${outputData?.lesson_code || 'TOAN-8'}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateStoryboard = async () => {
    if (!outputData?.khdh_draft) return;
    setGeneratingStoryboard(true);
    setError(null);
    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const res = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          khdhDraft: outputData.khdh_draft,
          lessonCode: outputData.lesson_code,
          apiKeys: activeKeys,
          videoStyle: selectedVideoStyle,
          videoGenre: selectedVideoGenre,
          numScenes8s: selectedNumScenes8s,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo Kịch bản Video.');
      }

      setStoryboardData(data.storyboard);
      setActiveTab('storyboard');
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Lỗi khi tạo Kịch bản Video.';
      setError(msg);
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  const handleCopySnippet = (text: string, targetKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTarget(targetKey);
    setTimeout(() => {
      setCopiedTarget(null);
    }, 2000);
  };

  const handleCopyFullScene = (scene: any, sceneIndex: number) => {
    const sceneCodeText = [
      `// ==========================================`,
      `// CẢNH ${scene.sceneNumber}: ${scene.title.toUpperCase()} (${scene.duration})`,
      `// ==========================================`,
      ``,
      `// [1. PROMPT ẢNH KEYFRAME - MIDJOURNEY / FLUX / DALL-E 3]`,
      scene.imagePrompt || scene.videoPrompt || '',
      ``,
      `// [2. PROMPT VIDEO CHUYỂN ĐỘNG - RUNWAY GEN-3 / KLING 1.5 / SORA]`,
      scene.videoPrompt || scene.aiVideoPrompt || '',
      ``,
      `// [3. LỜI THOẠI THUYẾT MINH TIẾNG VIỆT]`,
      scene.voiceoverScript || '',
      ``,
      `// [4. CHỮ / CÔNG THỨC TRÊN MÀN HÌNH]`,
      scene.onScreenText || '',
      ``,
      `// [5. ÂM THANH / NHẠC NỀN BGM]`,
      scene.audioPrompt || '',
    ].join('\n');

    handleCopySnippet(sceneCodeText, `scene_full_${sceneIndex}`);
  };

  const handleCopyAllVideoPrompts = () => {
    if (!storyboardData?.scenes) return;
    const allVideoPrompts = storyboardData.scenes
      .map((s) => `// --- CẢNH ${s.sceneNumber}: ${s.title} (${s.duration}) ---\n${s.videoPrompt || s.aiVideoPrompt || ''}\n`)
      .join('\n');
    handleCopySnippet(allVideoPrompts, 'all_video_prompts');
  };

  const handleCopyAllImagePrompts = () => {
    if (!storyboardData?.scenes) return;
    const allImgPrompts = storyboardData.scenes
      .map((s) => `// --- CẢNH ${s.sceneNumber}: ${s.title} (${s.duration}) ---\n${s.imagePrompt || s.videoPrompt || ''}\n`)
      .join('\n');
    handleCopySnippet(allImgPrompts, 'all_img_prompts');
  };

  const handleCopyAllVoiceovers = () => {
    if (!storyboardData?.scenes) return;
    const allVoiceovers = storyboardData.scenes
      .map((s) => `[Cảnh ${s.sceneNumber} - ${s.duration}]: "${s.voiceoverScript}"\n`)
      .join('\n');
    handleCopySnippet(allVoiceovers, 'all_voiceovers');
  };

  const handleCopyFullCodeText = () => {
    if (!storyboardData?.scenes) return;
    const fullCodeText = [
      `/* =========================================================================`,
      ` * KỊCH BẢN VIDEO MICRO-LEARNING & BỘ PROMPTS AI TỔNG HỢP`,
      ` * BÀI HỌC: ${storyboardData.lessonTitle}`,
      ` * MÃ BÀI HỌC: ${storyboardData.lessonCode}`,
      ` * TỔNG THỜI LƯỢNG: ${storyboardData.totalDuration}`,
      ` * PHONG CÁCH: ${storyboardData.videoStyle}`,
      ` * ĐỐI TƯỢNG: ${storyboardData.targetAudience}`,
      ` * ========================================================================= */`,
      ``,
      ...storyboardData.scenes.map((s) =>
        [
          `// ==========================================`,
          `// CẢNH ${s.sceneNumber}: ${s.title.toUpperCase()} (${s.duration})`,
          `// ==========================================`,
          `// 👁️ MÔ TẢ HÌNH ẢNH: ${s.visualDescription}`,
          `// 📺 HIỂN THỊ MÀN HÌNH: ${s.onScreenText}`,
          `// 🎵 ÂM THANH / BGM: ${s.audioPrompt}`,
          ``,
          `// 🖼️ [PROMPT ẢNH KEYFRAME - MIDJOURNEY / FLUX]:`,
          s.imagePrompt || s.videoPrompt || '',
          ``,
          `// 🎬 [PROMPT VIDEO CHUYỂN ĐỘNG - RUNWAY / KLING / SORA]:`,
          s.videoPrompt || s.aiVideoPrompt || '',
          ``,
          `// 🎙️ [LỜI THOẠI THUYẾT MINH TIẾNG VIỆT]:`,
          `"${s.voiceoverScript}"`,
          `\n`,
        ].join('\n')
      ),
    ].join('\n');

    handleCopySnippet(fullCodeText, 'all_full_code');
  };

  const handleDownloadStoryboardMd = () => {
    if (!storyboardData) return;
    const mdLines = [
      `# KỊCH BẢN VIDEO & PROMPTS AI: ${storyboardData.lessonTitle}`,
      `- Mã bài học: ${storyboardData.lessonCode}`,
      `- Tổng thời lượng: ${storyboardData.totalDuration}`,
      `- Phong cách video: ${storyboardData.videoStyle}`,
      `- Đối tượng: ${storyboardData.targetAudience}`,
      `\n---\n`,
      ...storyboardData.scenes.map((s) =>
        [
          `## Cảnh ${s.sceneNumber}: ${s.title} (${s.duration})`,
          `- **Mô tả thị giác:** ${s.visualDescription}`,
          `- **Chữ hiển thị:** ${s.onScreenText}`,
          `- **Âm thanh / BGM:** ${s.audioPrompt}`,
          `- **Lời thoại tiếng Việt:**`,
          `> "${s.voiceoverScript}"`,
          `- **Prompt Ảnh Keyframe (Midjourney / Flux):**`,
          `\`\`\`text\n${s.imagePrompt || s.videoPrompt || ''}\n\`\`\``,
          `- **Prompt Video Chuyển động (Runway / Kling / Sora):**`,
          `\`\`\`text\n${s.videoPrompt || s.aiVideoPrompt || ''}\n\`\`\``,
          `\n`,
        ].join('\n')
      ),
    ];

    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STORYBOARD_${outputData?.lesson_code || 'TOAN-8'}_${Date.now()}.md`;
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
                onChange={(e) => {
                  setLessonCode(e.target.value);
                  if (isConfigLocked) setIsConfigLocked(false);
                }}
                disabled={loading || analyzingLesson}
                className="input-field text-sm"
                placeholder="Ví dụ: TOAN-8-HKI-SODAISO-C01-STT01 hoặc Đơn thức và đa thức nhiều biến - 2 tiết"
              />
            </div>

            {/* Pre-Analysis Action Button & Locked State Badge */}
            <div className="space-y-2">
              {!isConfigLocked && (
                <button
                  type="button"
                  onClick={handleAnalyzeLesson}
                  disabled={analyzingLesson || loading}
                  className="w-full py-2.5 px-3 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2"
                >
                  {analyzingLesson ? (
                    <>
                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-purple-700 border-t-transparent rounded-full" />
                      <span>Đang phân tích căn cứ PL1/PPCT/SGK...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>Phân tích yêu cầu &amp; Cố định cấu hình</span>
                    </>
                  )}
                </button>
              )}

              {isConfigLocked && lessonAnalysis && (
                <div className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-2 text-xs shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                      <span className="text-sm">🔒</span> CẤU HÌNH ĐÃ CỐ ĐỊNH
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAnalysisModal(true)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold text-[11px] underline"
                    >
                      Chi tiết
                    </button>
                  </div>

                  <div className="font-bold text-slate-900 text-xs leading-snug">
                    {lessonAnalysis.lessonTitle}
                  </div>

                  <div className="text-[11px] text-slate-600 flex flex-wrap gap-1.5">
                    <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium">
                      ⏱️ {lessonAnalysis.totalPeriods} tiết
                    </span>
                    <span className="bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium">
                      📚 {lessonAnalysis.grade} ({lessonAnalysis.term})
                    </span>
                  </div>

                  <div className="text-[11px] text-emerald-800">
                    ✓ Đã khóa {lessonAnalysis.objectives.knowledge.length} YCCĐ kiến thức &amp; {lessonAnalysis.objectives.competencies.length} năng lực.
                  </div>

                  <div className="pt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={handleUnlockConfig}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-300 text-[11px] font-medium"
                    >
                      Mở khóa
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAnalysisModal(true)}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold flex-1 text-center"
                    >
                      ✏️ Chỉnh sửa cấu hình
                    </button>
                  </div>
                </div>
              )}
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
            <div className="flex border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1 overflow-x-auto">
              {[
                { id: 'draft', label: '📝 Bản Thảo KHDH' },
                { id: 'preview', label: '📐 Xem Trước 2 Cột' },
                { id: 'worksheet', label: '📋 Phiếu Học Tập' },
                { id: 'game', label: '🎮 Trò Chơi HTML' },
                { id: 'storyboard', label: '🎬 Kịch Bản Video AI' },
                { id: 'slide', label: '📊 Slide & Canva' },
                { id: 'sources', label: '📚 Nguồn Sử Dụng' },
                { id: 'stats', label: '📈 Thống Kê & Key' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'draft' | 'preview' | 'worksheet' | 'game' | 'storyboard' | 'slide' | 'sources' | 'stats')}
                  className={`flex-1 min-w-[110px] py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
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

                  {activeTab === 'worksheet' && (
                    <div className="space-y-4">
                      {/* Action & Status Header */}
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                            <span>📋</span> PHIẾU HỌC TẬP PHÂN HÓA 3 MỨC ĐỘ
                          </h3>
                          <p className="text-xs text-emerald-800 mt-0.5">
                            Tự động bóc tách từ KHDH: Khung ghi nhớ, Bài tập Mức 1-2-3, Dòng kẻ chấm in ấn &amp; Rubric
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={handleGenerateWorksheet}
                            disabled={generatingWorksheet}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                          >
                            {generatingWorksheet ? (
                              <>
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                <span>Đang tạo PHT...</span>
                              </>
                            ) : (
                              <>
                                <span>⚡</span>
                                <span>{worksheetMarkdown ? 'Tạo Lại PHT' : 'Tạo Phiếu Học Tập'}</span>
                              </>
                            )}
                          </button>

                          {worksheetMarkdown && (
                            <>
                              <button
                                onClick={handleCopyWorksheet}
                                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                              >
                                <span>📋</span> Sao chép
                              </button>
                              <button
                                onClick={handleDownloadWorksheetWord}
                                disabled={exportingWorksheetWord}
                                className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                              >
                                {exportingWorksheetWord ? (
                                  <>
                                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                    <span>Đang xuất Word...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>📥</span>
                                    <span>Tải Word PHT (Chuẩn in)</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Content Preview */}
                      {generatingWorksheet && (
                        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                          <div className="animate-spin w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full" />
                          <div>
                            <p className="font-bold text-slate-800">Đang phân tích KHDH &amp; tạo Phiếu học tập phân hóa...</p>
                            <p className="text-xs text-slate-500 mt-1">Trích xuất kiến thức trọng tâm, bài tập 3 mức độ và dòng kẻ in ấn...</p>
                          </div>
                        </div>
                      )}

                      {!generatingWorksheet && !worksheetMarkdown && (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                          <span className="text-4xl">📄</span>
                          <h4 className="font-bold text-slate-800 text-sm">Chưa tạo Phiếu học tập cho bài này</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Nhấn nút &quot;Tạo Phiếu Học Tập&quot; ở trên để AI tự động bóc tách bản thảo KHDH thành Phiếu học tập 3 mức độ sẵn sàng in ấn cho học sinh.
                          </p>
                          <button
                            onClick={handleGenerateWorksheet}
                            className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                          >
                            <span>🚀</span> Tạo Phiếu Học Tập Ngay
                          </button>
                        </div>
                      )}

                      {!generatingWorksheet && worksheetMarkdown && (
                        <div className="space-y-4">
                          {/* Student Header Mockup */}
                          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                            <div className="flex justify-between font-bold text-slate-800 border-b pb-2">
                              <span>TRƯỜNG THCS QUANG TRUNG — TỔ TOÁN TIN</span>
                              <span>NĂM HỌC 2026 - 2027</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 pt-1">
                              <div>Họ và tên học sinh: ................................................................</div>
                              <div>Lớp: 8A.....  Nhóm: ........  Thời gian: 15-20 phút</div>
                            </div>
                          </div>

                          {/* Markdown Body */}
                          <div className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-800 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                            {worksheetMarkdown}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'game' && (
                    <div className="space-y-4">
                      {/* Action & Control Bar */}
                      <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                            <span>🎮</span> TRÒ CHƠI TƯƠNG TÁC (SINGLE-FILE HTML CHẠY OFFLINE)
                          </h3>
                          <p className="text-xs text-indigo-800 mt-0.5">
                            Bóc tách câu hỏi từ KHDH, tích hợp âm thanh Web Audio, KaTeX công thức Toán &amp; pháo hoa chiến thắng
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleGenerateGame()}
                            disabled={generatingGame}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                          >
                            {generatingGame ? (
                              <>
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                <span>Đang tạo Game...</span>
                              </>
                            ) : (
                              <>
                                <span>⚡</span>
                                <span>{gameHtml ? 'Tạo Lại Game' : 'Tạo Trò Chơi'}</span>
                              </>
                            )}
                          </button>

                          {gameHtml && (
                            <button
                              onClick={handleDownloadGameHtml}
                              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                            >
                              <span>📥</span>
                              <span>Tải File Game (.html)</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Loading State */}
                      {generatingGame && (
                        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                          <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
                          <div>
                            <p className="font-bold text-slate-800">Đang phân tích KHDH &amp; biên dịch Trò chơi tương tác...</p>
                            <p className="text-xs text-slate-500 mt-1">Đóng gói âm thanh hiệu ứng, công thức Toán KaTeX và giao diện chơi...</p>
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {!generatingGame && !gameHtml && (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                          <span className="text-4xl">🚀</span>
                          <h4 className="font-bold text-slate-800 text-sm">Chưa có Trò chơi tương tác cho bài học này</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Nhấn nút &quot;Tạo Trò Chơi&quot; ở trên để AI tự động trích xuất các câu hỏi từ KHDH thành file game HTML5 chuyên nghiệp, chơi được trực tiếp hoặc chiếu trên lớp học.
                          </p>
                          <button
                            onClick={() => handleGenerateGame()}
                            className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                          >
                            <span>🎮</span> Tạo Trò Chơi Ngay
                          </button>
                        </div>
                      )}

                      {/* Live Interactive Iframe Preview */}
                      {!generatingGame && gameHtml && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center px-1">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <span>🕹️</span> Khung chơi thử trực tiếp (Interactive Live Preview):
                            </span>
                            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              🟢 Sẵn sàng trình chiếu / Chạy Offline
                            </span>
                          </div>
                          <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-xl">
                            <iframe
                              srcDoc={gameHtml}
                              title="Interactive Math Game"
                              className="w-full h-[560px] border-0"
                              sandbox="allow-scripts allow-same-origin allow-modals"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'storyboard' && (
                    <div className="space-y-4">
                      {/* Google Flow & Video AI Master Configuration Bar */}
                      <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-2xl shadow-xs space-y-4">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 bg-purple-700 text-white font-black text-[10px] uppercase tracking-wider rounded-md">
                                GOOGLE FLOW &amp; VIDEO AI READY
                              </span>
                              <h3 className="text-sm font-black text-purple-950 flex items-center gap-1.5">
                                <span>🎬</span> KỊCH BẢN VIDEO GIÁO DỤC 8S (GOOGLE FLOW / VEO / SORA)
                              </h3>
                            </div>
                            <p className="text-xs text-purple-800 mt-1">
                              Tạo bộ phân cảnh chuẩn <strong>8 giây/clip</strong> cho Google Flow. Prompt B-Roll cam kết <strong>KHÔNG TEXT, KHÔNG UI, KHÔNG WATERMARK</strong>; lời thoại và công thức được tách riêng cho khâu chèn hậu kỳ.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={handleGenerateStoryboard}
                              disabled={generatingStoryboard}
                              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                            >
                              {generatingStoryboard ? (
                                <>
                                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                  <span>Đang xuất kịch bản 8s...</span>
                                </>
                              ) : (
                                <>
                                  <span>🚀</span>
                                  <span>{storyboardData ? 'Tạo Lại Kịch Bản 8s' : 'Xuất Kịch Bản Google Flow'}</span>
                                </>
                              )}
                            </button>

                            {storyboardData && (
                              <button
                                onClick={handleDownloadStoryboardMd}
                                className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                              >
                                <span>📥</span>
                                <span>Tải Kịch Bản (.md)</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 3 Interactive Buttons / Selectors for Google Flow */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-purple-200/80 text-xs">
                          {/* (1) Phong cách (Visual Style) */}
                          <div className="bg-white/90 p-3 rounded-xl border border-purple-200 shadow-2xs space-y-1.5">
                            <label className="block text-[11px] font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1">
                              <span>🎨</span> (1) Phong cách Thị giác:
                            </label>
                            <select
                              value={selectedVideoStyle}
                              onChange={(e) => setSelectedVideoStyle(e.target.value as VideoStyleId)}
                              disabled={generatingStoryboard}
                              className="w-full bg-purple-50/50 border border-purple-300 text-purple-950 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                            >
                              {VIDEO_STYLES.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.icon} {st.label}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {VIDEO_STYLES.find((s) => s.id === selectedVideoStyle)?.desc}
                            </p>
                          </div>

                          {/* (2) Số cảnh 8 giây (Number of 8s Scenes) */}
                          <div className="bg-white/90 p-3 rounded-xl border border-purple-200 shadow-2xs space-y-1.5">
                            <label className="block text-[11px] font-bold text-purple-950 uppercase tracking-wider flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <span>⏱️</span> (2) Số cảnh 8 giây:
                              </span>
                              <span className="text-[11px] font-black text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">
                                Tổng: {selectedNumScenes8s * 8}s
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {SCENE_COUNT_OPTIONS.map((count) => (
                                <button
                                  key={count}
                                  type="button"
                                  onClick={() => setSelectedNumScenes8s(count)}
                                  disabled={generatingStoryboard}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                                    selectedNumScenes8s === count
                                      ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                                      : 'bg-white hover:bg-purple-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {count} cảnh ({count * 8}s)
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                              Mỗi clip đúng 8s theo chuẩn tạo video Google Flow &amp; Veo.
                            </p>
                          </div>

                          {/* (3) Các thể loại video giáo dục (Educational Video Genres) */}
                          <div className="bg-white/90 p-3 rounded-xl border border-purple-200 shadow-2xs space-y-1.5">
                            <label className="block text-[11px] font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1">
                              <span>📚</span> (3) Thể loại Video Giáo dục:
                            </label>
                            <select
                              value={selectedVideoGenre}
                              onChange={(e) => setSelectedVideoGenre(e.target.value as VideoGenreId)}
                              disabled={generatingStoryboard}
                              className="w-full bg-purple-50/50 border border-purple-300 text-purple-950 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                            >
                              {VIDEO_GENRES.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.icon} {g.label}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {VIDEO_GENRES.find((g) => g.id === selectedVideoGenre)?.desc}
                            </p>
                          </div>
                        </div>

                        {/* Standard Compliance Banner */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-purple-100/70 border border-purple-200 rounded-xl text-[11px] text-purple-900 font-medium">
                          <span className="text-sm">🛡️</span>
                          <span>
                            <strong>Quy chuẩn Google Flow:</strong> Mọi cảnh video &amp; ảnh sinh ra đều có cờ <code>--no text, words, ui, buttons, watermark</code>. Video thuần hiệu ứng thị giác b-roll để bạn ghép voiceover và overlay text trong CapCut/Canva.
                          </span>
                        </div>

                        {/* Batch Copy Toolbar */}
                        {storyboardData && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-purple-200/80 text-xs">
                            <span className="text-purple-900 font-bold text-[11px] flex items-center gap-1 mr-1">
                              <span>⚡</span> Sao chép nhanh:
                            </span>

                            <button
                              onClick={handleCopyAllVideoPrompts}
                              className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border shadow-2xs flex items-center gap-1 ${
                                copiedTarget === 'all_video_prompts'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <span>{copiedTarget === 'all_video_prompts' ? '✓' : '🎬'}</span>
                              <span>{copiedTarget === 'all_video_prompts' ? 'Đã copy All Video Prompts!' : 'Copy Tất Cả Prompt Video'}</span>
                            </button>

                            <button
                              onClick={handleCopyAllImagePrompts}
                              className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border shadow-2xs flex items-center gap-1 ${
                                copiedTarget === 'all_img_prompts'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <span>{copiedTarget === 'all_img_prompts' ? '✓' : '🖼️'}</span>
                              <span>{copiedTarget === 'all_img_prompts' ? 'Đã copy All Image Prompts!' : 'Copy Tất Cả Prompt Ảnh'}</span>
                            </button>

                            <button
                              onClick={handleCopyAllVoiceovers}
                              className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border shadow-2xs flex items-center gap-1 ${
                                copiedTarget === 'all_voiceovers'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <span>{copiedTarget === 'all_voiceovers' ? '✓' : '🎙️'}</span>
                              <span>{copiedTarget === 'all_voiceovers' ? 'Đã copy All Lời thoại!' : 'Copy Tất Cả Lời Thoại'}</span>
                            </button>

                            <button
                              onClick={handleCopyFullCodeText}
                              className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-all border shadow-2xs flex items-center gap-1 ${
                                copiedTarget === 'all_full_code'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-purple-900 hover:bg-purple-950 text-white border-purple-900'
                              }`}
                            >
                              <span>{copiedTarget === 'all_full_code' ? '✓' : '📋'}</span>
                              <span>{copiedTarget === 'all_full_code' ? 'Đã copy Toàn Bộ Kịch Bản!' : 'Copy Full Code Text'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Loading State */}
                      {generatingStoryboard && (
                        <div className="h-64 flex flex-col items-center justify-center text-center space-y-4">
                          <div className="animate-spin w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full" />
                          <div>
                            <p className="font-bold text-slate-800">Đang kiến tạo Storyboard &amp; Bộ Prompt AI Video...</p>
                            <p className="text-xs text-slate-500 mt-1">Đóng gói Prompt Ảnh, Prompt Video Runway/Sora và Lời thoại tiếng Việt chuẩn sư phạm...</p>
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {!generatingStoryboard && !storyboardData && (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-3">
                          <span className="text-4xl">🎬</span>
                          <h4 className="font-bold text-slate-800 text-sm">Chưa có Kịch bản Video cho bài học này</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Nhấn nút &quot;Tạo Kịch Bản Video&quot; để AI tự động chuyển hóa KHDH thành kịch bản phân cảnh Storyboard 5 bước có đủ Prompt Ảnh, Prompt Video và Lời thoại tiếng Việt dưới dạng code text dễ copy.
                          </p>
                          <button
                            onClick={handleGenerateStoryboard}
                            className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                          >
                            <span>🚀</span> Tạo Kịch Bản Video Ngay
                          </button>
                        </div>
                      )}

                      {/* Storyboard Content Matrix */}
                      {!generatingStoryboard && storyboardData && (
                        <div className="space-y-4">
                          {/* Summary Bar */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl text-xs">
                              <span className="text-purple-700 font-semibold block">⏱️ Thời lượng 8s/clip:</span>
                              <span className="font-bold text-purple-950 text-xs sm:text-sm">{storyboardData.totalDuration}</span>
                            </div>
                            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
                              <span className="text-blue-700 font-semibold block">🎨 Phong cách:</span>
                              <span className="font-bold text-blue-950 text-xs">{storyboardData.videoStyle}</span>
                            </div>
                            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs">
                              <span className="text-indigo-700 font-semibold block">📚 Thể loại:</span>
                              <span className="font-bold text-indigo-950 text-xs">{storyboardData.videoGenre || 'Khám phá kiến thức'}</span>
                            </div>
                            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
                              <span className="text-emerald-700 font-semibold block">🎯 Quy chuẩn Prompt:</span>
                              <span className="font-bold text-emerald-950 text-xs">Zero-Text / Clean B-Roll</span>
                            </div>
                          </div>

                          {/* Scenes List */}
                          <div className="space-y-5">
                            {storyboardData.scenes.map((scene, idx) => {
                              const imgPrompt = scene.imagePrompt || scene.videoPrompt || '';
                              const vidPrompt = scene.videoPrompt || scene.aiVideoPrompt || '';
                              const voScript = scene.voiceoverScript || '';

                              return (
                                <div
                                  key={idx}
                                  className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 hover:border-purple-300 transition-all"
                                >
                                  {/* Scene Header */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2.5">
                                      <span className="px-2.5 py-1 bg-purple-700 text-white rounded-lg font-black text-xs shadow-2xs">
                                        CẢNH {scene.sceneNumber}
                                      </span>
                                      <h4 className="font-bold text-slate-900 text-sm">
                                        {scene.title}
                                      </h4>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="px-2.5 py-1 bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-900 border border-purple-200 rounded-full text-xs font-bold flex items-center gap-1">
                                        <span>⏱️</span> {scene.duration || '8s'} (Google Flow Ready)
                                      </span>
                                      <button
                                        onClick={() => handleCopyFullScene(scene, idx)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                          copiedTarget === `scene_full_${idx}`
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                                        }`}
                                      >
                                        <span>{copiedTarget === `scene_full_${idx}` ? '✓' : '📋'}</span>
                                        <span>{copiedTarget === `scene_full_${idx}` ? 'Đã copy Cảnh ' + scene.sceneNumber : 'Copy Trọn Cảnh ' + scene.sceneNumber}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Scene Context Info */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div>
                                      <span className="font-bold text-slate-700 block mb-0.5">👁️ Mô tả thị giác &amp; Góc quay:</span>
                                      <p className="text-slate-600 leading-relaxed">{scene.visualDescription}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                      {scene.onScreenText && (
                                        <div>
                                          <span className="font-bold text-slate-700 block mb-0.5">📺 Chữ / Công thức trên màn hình:</span>
                                          <div className="font-mono text-blue-800 font-bold bg-blue-50/80 p-1.5 rounded border border-blue-200 text-[11px]">
                                            {scene.onScreenText}
                                          </div>
                                        </div>
                                      )}
                                      {scene.audioPrompt && (
                                        <div className="text-[11px] text-slate-500">
                                          <span className="font-bold text-slate-700">🎵 Âm thanh:</span> {scene.audioPrompt}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* 3 Core Code Text Blocks */}
                                  <div className="space-y-3">
                                    {/* 1. Lời thoại tiếng Việt */}
                                    <div className="rounded-xl overflow-hidden border border-amber-200 bg-amber-50/40">
                                      <div className="px-3 py-2 bg-amber-100/70 border-b border-amber-200 flex items-center justify-between">
                                        <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                                          <span>🎙️</span> Lời Thoại Thuyết Minh Tiếng Việt (Sư Phạm / ElevenLabs / Vbee):
                                        </span>
                                        <button
                                          onClick={() => handleCopySnippet(voScript, `vo_${idx}`)}
                                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                            copiedTarget === `vo_${idx}`
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
                                          }`}
                                        >
                                          <span>{copiedTarget === `vo_${idx}` ? '✓' : '📋'}</span>
                                          <span>{copiedTarget === `vo_${idx}` ? 'Đã copy!' : 'Copy Lời Thoại'}</span>
                                        </button>
                                      </div>
                                      <div className="p-3 font-mono text-xs text-amber-950 whitespace-pre-wrap leading-relaxed bg-white/70">
                                        &quot;{voScript}&quot;
                                      </div>
                                    </div>

                                    {/* 2. Prompt Ảnh Keyframe */}
                                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100">
                                      <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                                          <span>🖼️</span> Prompt Ảnh Keyframe (Midjourney v6 / Flux.1 / DALL-E 3):
                                        </span>
                                        <button
                                          onClick={() => handleCopySnippet(imgPrompt, `img_${idx}`)}
                                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                            copiedTarget === `img_${idx}`
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700'
                                          }`}
                                        >
                                          <span>{copiedTarget === `img_${idx}` ? '✓' : '📋'}</span>
                                          <span>{copiedTarget === `img_${idx}` ? 'Đã copy!' : 'Copy Prompt Ảnh'}</span>
                                        </button>
                                      </div>
                                      <div className="p-3 font-mono text-xs text-sky-300 whitespace-pre-wrap leading-relaxed overflow-x-auto select-all">
                                        {imgPrompt}
                                      </div>
                                    </div>

                                    {/* 3. Prompt Video Chuyển Động */}
                                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100">
                                      <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                          <span>🎬</span> Prompt Video Chuyển Động (Runway Gen-3 Alpha / Kling 1.5 / Sora):
                                        </span>
                                        <button
                                          onClick={() => handleCopySnippet(vidPrompt, `vid_${idx}`)}
                                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                                            copiedTarget === `vid_${idx}`
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700'
                                          }`}
                                        >
                                          <span>{copiedTarget === `vid_${idx}` ? '✓' : '📋'}</span>
                                          <span>{copiedTarget === `vid_${idx}` ? 'Đã copy!' : 'Copy Prompt Video'}</span>
                                        </button>
                                      </div>
                                      <div className="p-3 font-mono text-xs text-emerald-300 whitespace-pre-wrap leading-relaxed overflow-x-auto select-all">
                                        {vidPrompt}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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

      {/* Lesson Requirement Analysis & Locked Configuration Modal */}
      {showAnalysisModal && lessonAnalysis && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white max-w-2xl w-full rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>🔍</span> Phân Tích Yêu Cầu &amp; Cố Định Cấu Hình Bài Học
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bóc tách từ Chương trình GDPT 2018 &amp; Căn cứ tài liệu nguồn (Phụ lục I, PPCT, SGK)
                </p>
              </div>
              <button
                onClick={() => setShowAnalysisModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <div className="space-y-4 text-xs">
              {/* 1. Tên bài & Thời lượng */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📌</span> 1. Thông tin bài dạy chuẩn:
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    Tên bài học chuẩn:
                  </label>
                  <input
                    type="text"
                    value={lessonAnalysis.lessonTitle}
                    onChange={(e) =>
                      setLessonAnalysis({ ...lessonAnalysis, lessonTitle: e.target.value })
                    }
                    className="input-field text-xs font-bold text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Số tiết:</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={lessonAnalysis.totalPeriods}
                      onChange={(e) =>
                        setLessonAnalysis({
                          ...lessonAnalysis,
                          totalPeriods: parseInt(e.target.value) || 1,
                        })
                      }
                      className="input-field text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Khối lớp:</label>
                    <input
                      type="text"
                      value={lessonAnalysis.grade}
                      onChange={(e) =>
                        setLessonAnalysis({ ...lessonAnalysis, grade: e.target.value })
                      }
                      className="input-field text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Học kỳ:</label>
                    <input
                      type="text"
                      value={lessonAnalysis.term}
                      onChange={(e) =>
                        setLessonAnalysis({ ...lessonAnalysis, term: e.target.value })
                      }
                      className="input-field text-xs text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    Phân bổ nội dung từng tiết:
                  </label>
                  <div className="space-y-1.5">
                    {lessonAnalysis.periodBreakdown.map((periodText, pIdx) => (
                      <input
                        key={pIdx}
                        type="text"
                        value={periodText}
                        onChange={(e) => {
                          const updated = [...lessonAnalysis.periodBreakdown];
                          updated[pIdx] = e.target.value;
                          setLessonAnalysis({ ...lessonAnalysis, periodBreakdown: updated });
                        }}
                        className="input-field text-xs"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Yêu cầu cần đạt (YCCĐ) */}
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                <div className="font-bold text-blue-950 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>🎯</span> 2. Yêu cầu cần đạt (YCCĐ) cố định:
                  </span>
                  <span className="text-[11px] text-blue-700 font-normal">
                    AI sẽ tuân thủ nghiêm ngặt các mục này
                  </span>
                </div>

                {/* Kiến thức */}
                <div>
                  <span className="font-bold text-slate-700 block mb-1">a) Về Kiến thức:</span>
                  <div className="space-y-1 bg-white p-2.5 rounded-lg border border-blue-100">
                    {lessonAnalysis.objectives.knowledge.map((k, kIdx) => (
                      <div key={kIdx} className="flex items-center gap-2 text-slate-800">
                        <span className="text-blue-600 font-bold">•</span>
                        <input
                          type="text"
                          value={k}
                          onChange={(e) => {
                            const updated = [...lessonAnalysis.objectives.knowledge];
                            updated[kIdx] = e.target.value;
                            setLessonAnalysis({
                              ...lessonAnalysis,
                              objectives: { ...lessonAnalysis.objectives, knowledge: updated },
                            });
                          }}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 outline-hidden py-0.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Năng lực */}
                <div>
                  <span className="font-bold text-slate-700 block mb-1">b) Về Năng lực toán học:</span>
                  <div className="space-y-1 bg-white p-2.5 rounded-lg border border-blue-100">
                    {lessonAnalysis.objectives.competencies.map((c, cIdx) => (
                      <div key={cIdx} className="flex items-center gap-2 text-slate-800">
                        <span className="text-emerald-600 font-bold">•</span>
                        <input
                          type="text"
                          value={c}
                          onChange={(e) => {
                            const updated = [...lessonAnalysis.objectives.competencies];
                            updated[cIdx] = e.target.value;
                            setLessonAnalysis({
                              ...lessonAnalysis,
                              objectives: { ...lessonAnalysis.objectives, competencies: updated },
                            });
                          }}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 outline-hidden py-0.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phẩm chất */}
                <div>
                  <span className="font-bold text-slate-700 block mb-1">c) Về Phẩm chất:</span>
                  <div className="space-y-1 bg-white p-2.5 rounded-lg border border-blue-100">
                    {lessonAnalysis.objectives.qualities.map((q, qIdx) => (
                      <div key={qIdx} className="flex items-center gap-2 text-slate-800">
                        <span className="text-purple-600 font-bold">•</span>
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => {
                            const updated = [...lessonAnalysis.objectives.qualities];
                            updated[qIdx] = e.target.value;
                            setLessonAnalysis({
                              ...lessonAnalysis,
                              objectives: { ...lessonAnalysis.objectives, qualities: updated },
                            });
                          }}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 outline-hidden py-0.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Khái niệm & Phương pháp */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>💡</span> 3. Khái niệm trọng tâm &amp; Phương pháp dạy học:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="font-semibold text-slate-600 block mb-1">Khái niệm cốt lõi:</span>
                    <div className="bg-white p-2 rounded-lg border text-[11px] text-slate-700 space-y-1">
                      {lessonAnalysis.keyConcepts.map((kc, kcIdx) => (
                        <div key={kcIdx} className="flex items-center gap-1.5">
                          <span className="text-amber-500 font-bold">✓</span> {kc}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600 block mb-1">Phương pháp sư phạm:</span>
                    <div className="bg-white p-2 rounded-lg border text-[11px] text-slate-700 space-y-1">
                      {lessonAnalysis.pedagogicalMethods.map((pm, pmIdx) => (
                        <div key={pmIdx} className="flex items-center gap-1.5">
                          <span className="text-indigo-500 font-bold">✓</span> {pm}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Ghi chú riêng */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Ghi chú hoặc yêu cầu riêng của bạn cho bài này:
                </label>
                <input
                  type="text"
                  value={lessonAnalysis.customNotes || ''}
                  onChange={(e) =>
                    setLessonAnalysis({ ...lessonAnalysis, customNotes: e.target.value })
                  }
                  placeholder="Ví dụ: Tăng cường bài toán thực tế về kinh tế, dùng phương pháp khăn trải bàn..."
                  className="input-field text-xs"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 pt-4 gap-3">
              <button
                type="button"
                onClick={() => setShowAnalysisModal(false)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
              >
                Đóng
              </button>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => handleLockConfig(false)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span>🔒</span>
                  <span>Lưu &amp; Cố Định Cấu Hình</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLockConfig(true)}
                  className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <span>🚀</span>
                  <span>Cố Định &amp; Thực Thi KHDH Ngay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
