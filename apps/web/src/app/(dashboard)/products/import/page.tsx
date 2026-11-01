'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ImportError {
  row: number;
  sku: string;
  reason: string;
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: ImportError[];
}

export default function ProductImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const res = await api().get('/products/import/template', {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const acceptFile = (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!validTypes.includes(file.type) && !validExt) return;
    setSelectedFile(file);
    setResult(null);
    setUploadError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setResult(null);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await api().post<{ data: ImportResult }>(
        '/products/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(res.data.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Upload failed. Please try again.';
      setUploadError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsUploading(false);
    }
  };

  const outcomeColor = result
    ? result.errors.length === 0
      ? 'border-green-200 bg-green-50'
      : result.created > 0
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-red-200 bg-red-50'
    : '';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Products
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Products</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a spreadsheet to bulk-create products. Up to 2,000 rows per file.
        </p>
      </div>

      {/* Step 1: Download template */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Step 1 — Download the template
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Fill in the Excel template with your product data. Do not change the
          column headers.
        </p>
        <button
          onClick={handleDownloadTemplate}
          disabled={isDownloadingTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
        >
          {isDownloadingTemplate ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          Download Template
        </button>
      </div>

      {/* Step 2: Upload file */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Step 2 — Upload your file
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Accepted formats: .xlsx, .xls, .csv. Max file size 5 MB.
        </p>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
          )}
        >
          <FileSpreadsheet size={32} className="text-gray-400 mb-3" />
          {selectedFile ? (
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {(selectedFile.size / 1024).toFixed(1)} KB — click to change
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Drag & drop your file here, or{' '}
                <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {selectedFile && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Upload &amp; Import
                </>
              )}
            </button>
          </div>
        )}

        {uploadError && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className={cn('bg-white rounded-xl border p-5', outcomeColor)}>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Import Results
          </h2>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{result.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
            </div>
            <div className="bg-white rounded-lg border border-green-200 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">
                {result.created}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Created</p>
            </div>
            <div className="bg-white rounded-lg border border-yellow-200 p-3 text-center">
              <p className="text-2xl font-bold text-yellow-700">
                {result.skipped}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Skipped (dup SKU)</p>
            </div>
            <div className="bg-white rounded-lg border border-red-200 p-3 text-center">
              <p className="text-2xl font-bold text-red-700">
                {result.errors.length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Errors</p>
            </div>
          </div>

          {result.errors.length === 0 && result.created > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={16} />
              All rows imported successfully.
            </div>
          )}

          {result.skipped > 0 && result.errors.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-yellow-700 mt-2">
              <AlertCircle size={16} />
              {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped
              because the SKU already exists.
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Error details
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-700 w-16">
                        Row
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700 w-36">
                        SKU
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-3 py-2 text-gray-500">{e.row}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 text-xs">
                          {e.sku}
                        </td>
                        <td className="px-3 py-2 text-red-600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
