"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ApiKeyService } from '@/services/ai/api-key.service';
import type { MultiKeyTestResult } from '@/services/ai/ai.types';

const COMMANDS = [
  { id: 'KHOI_DONG', label: '🚀 Khởi động', desc: 'Lập chỉ mục nguồn & kiểm tra hệ thống' },
  { id: 'SOAN_XUAT', label: '✍️ Soạn xuất KHDH', desc: 'Soạn hoặc nâng cấp giáo án tự động' },
  { id: 'RA_SOAT_NHANH', label: '🔍 Rà soát nhanh (Delta QA)', desc: 'Kiểm tra lỗi và độ khớp nguồn' },
  { id: 'KIEM_TRA_TOAN', label: '📐 Kiểm tra Toán & OMML', desc: 'Chuẩn hóa công thức & Word Equation' },
  { id: 'TAO_SLIDE_NGHIEN_CUU', label: '📊 Tạo Slide nghiên cứu', desc: '15-20 slide chuẩn sư phạm mỗi tiết' },
  { id: 'XUAT_CANVA_PROMPT', label: '🎨 Xuất Canva Prompt', desc: 'Mã prompt độc lập cho từng slide' }
];

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
}

export default function Home() {
  const [command, setCommand] = useState('SOAN_XUAT');
  const [lessonCode, setLessonCode] = useState('TOAN-8-HKI-SODAISO-C01-STT01');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'draft' | 'preview' | 'slide' | 'stats'>('draft');
  const [error, setError] = useState<string | null>(null);
  const [outputData, setOutputData] = useState<OutputData | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string>('');

  // Multi-Key State
  const [showSettings, setShowSettings] = useState(false);
  const [rawKeysInput, setRawKeysInput] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [multiKeyResult, setMultiKeyResult] = useState<MultiKeyTestResult | null>(null);
  const [configuredKeyCount, setConfiguredKeyCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const keys = ApiKeyService.getClientKeys();
    if (keys.length > 0) {
      setRawKeysInput(keys.join('\n'));
      setConfiguredKeyCount(keys.length);
    }
  }, []);

  const currentParsedKeys = ApiKeyService.parseKeys(rawKeysInput);

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
    setPipelineStep('Đang kết nối Google AI...');
    setOutputData(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeKeys = currentParsedKeys.length > 0 ? currentParsedKeys : ApiKeyService.getClientKeys();
      const jobId = `JOB-${Date.now()}`;

      setPipelineStep('Đang điều phối Agent & thực thi (Xoay vòng Key tự động)...');

      const res = await fetch('/api/generate-khdh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.trim(),
          lessonCode: lessonCode.trim(),
          jobId,
          apiKeys: activeKeys,
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
                { id: 'stats', label: '📈 Thống Kê & Key' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'draft' | 'preview' | 'slide' | 'stats')}
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
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <span>📋</span> Sao chép Markdown
                  </button>
                  <button
                    onClick={handleDownload}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <span>⬇️</span> Tải file (.md)
                  </button>
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
    </main>
  );
}
