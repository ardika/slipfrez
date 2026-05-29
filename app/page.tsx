"use client";

import { useState } from "react";
import { parseAbsensiXls } from "./lib/parseAbsensi";
import { modifySlipForEmployee, SlipUpdateInfo } from "./lib/modifySlip";
import { AbsensiData, EmployeeCalc } from "./lib/types";

interface SlipUpload {
  file: File | null;
  result?: { blob: Blob; info: SlipUpdateInfo };
  error?: string;
  processing?: boolean;
}

interface ManualEmployee {
  nama: string;
  hariKerja: string;
  jamLembur: string;
}

function formatPeriodeLabel(startISO: string, endISO: string): string {
  const monShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${monShort[m - 1]} ${y}`;
  };
  return `${fmt(startISO)} - ${fmt(endISO)}`;
}

function buildManualAbsensiData(
  startISO: string,
  endISO: string,
  rows: ManualEmployee[],
): AbsensiData {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const nDays = Math.round((+end - +start) / 86_400_000) + 1;

  const employees: EmployeeCalc[] = rows
    .filter((r) => r.nama.trim() !== "")
    .map((r, idx) => {
      const hk = parseFloat(r.hariKerja) || 0;
      const lb = parseFloat(r.jamLembur) || 0;
      const threshold = hk * 8;
      return {
        id: `m${idx + 1}`,
        nama: r.nama.trim(),
        dept: "",
        hariKerja: hk,
        totalJamAktual: +(threshold + lb).toFixed(2),
        threshold,
        jamKerja: threshold,
        jamLembur: +lb.toFixed(2),
        daysDetail: [],
      };
    });

  return {
    periodeLabel: formatPeriodeLabel(startISO, endISO),
    startDate: startISO,
    endDate: endISO,
    nDays,
    holidays: [],
    employees,
  };
}

export default function Home() {
  const [mode, setMode] = useState<"xls" | "manual">("xls");
  const [absensiData, setAbsensiData] = useState<AbsensiData | null>(null);
  const [absensiError, setAbsensiError] = useState<string | null>(null);
  const [absensiLoading, setAbsensiLoading] = useState(false);
  const [slipUploads, setSlipUploads] = useState<Record<string, SlipUpload>>({});

  // Manual input state
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualRows, setManualRows] = useState<ManualEmployee[]>([
    { nama: "", hariKerja: "", jamLembur: "0" },
  ]);
  const [manualError, setManualError] = useState<string | null>(null);

  async function handleAbsensiUpload(file: File) {
    setAbsensiError(null);
    setAbsensiLoading(true);
    try {
      const data = await parseAbsensiXls(file);
      setAbsensiData(data);
      const init: Record<string, SlipUpload> = {};
      for (const e of data.employees) if (e.hariKerja > 0) init[e.id] = { file: null };
      setSlipUploads(init);
    } catch (e) {
      setAbsensiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAbsensiLoading(false);
    }
  }

  function handleManualSubmit() {
    setManualError(null);
    if (!manualStart || !manualEnd) {
      setManualError("Periode mulai dan akhir wajib diisi.");
      return;
    }
    if (manualStart > manualEnd) {
      setManualError("Tanggal mulai harus sebelum tanggal akhir.");
      return;
    }
    const validRows = manualRows.filter((r) => r.nama.trim() !== "");
    if (validRows.length === 0) {
      setManualError("Tambahkan minimal satu karyawan.");
      return;
    }
    for (const r of validRows) {
      if (!r.hariKerja || parseFloat(r.hariKerja) <= 0) {
        setManualError(`Hari Kerja untuk "${r.nama}" wajib diisi (> 0).`);
        return;
      }
    }
    const data = buildManualAbsensiData(manualStart, manualEnd, validRows);
    setAbsensiData(data);
    const init: Record<string, SlipUpload> = {};
    for (const e of data.employees) init[e.id] = { file: null };
    setSlipUploads(init);
  }

  async function handleSlipUpload(emp: EmployeeCalc, file: File) {
    setSlipUploads((s) => ({ ...s, [emp.id]: { file, processing: true } }));
    try {
      const result = await modifySlipForEmployee(file, emp, absensiData!.periodeLabel);
      setSlipUploads((s) => ({ ...s, [emp.id]: { file, result } }));
    } catch (e) {
      setSlipUploads((s) => ({
        ...s,
        [emp.id]: { file, error: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setAbsensiData(null);
    setAbsensiError(null);
    setSlipUploads({});
    setManualError(null);
  }

  function addRow() {
    setManualRows((rs) => [...rs, { nama: "", hariKerja: "", jamLembur: "0" }]);
  }

  function removeRow(idx: number) {
    setManualRows((rs) => rs.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<ManualEmployee>) {
    setManualRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const employeesWithAttendance = absensiData?.employees.filter((e) => e.hariKerja > 0) ?? [];
  const employeesNoAttendance = absensiData?.employees.filter((e) => e.hariKerja === 0) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Slip Gaji FREZ</h1>
          <p className="mt-1 text-sm text-slate-600">
            Hitung hari kerja, jam kerja, jam lembur — dari laporan absensi (.xls) atau input
            manual — lalu modifikasi slip gaji bulan sebelumnya untuk tiap karyawan.
          </p>
        </header>

        {/* STEP 1 */}
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              1
            </span>
            Input Data Absensi
          </h2>

          {!absensiData && (
            <>
              {/* Mode toggle */}
              <div className="mb-4 inline-flex rounded-md border border-slate-300 bg-slate-100 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setMode("xls")}
                  className={`rounded px-3 py-1.5 font-medium transition ${
                    mode === "xls" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Upload XLS
                </button>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className={`rounded px-3 py-1.5 font-medium transition ${
                    mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Input Manual
                </button>
              </div>

              {mode === "xls" && (
                <label className="block">
                  <input
                    type="file"
                    accept=".xls,.xlsx,application/vnd.ms-excel"
                    disabled={absensiLoading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAbsensiUpload(f);
                    }}
                    className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 file:cursor-pointer"
                  />
                  {absensiLoading && <p className="mt-2 text-sm text-slate-500">Memproses…</p>}
                  {absensiError && (
                    <p className="mt-2 text-sm text-red-600">Error: {absensiError}</p>
                  )}
                </label>
              )}

              {mode === "manual" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Periode Mulai</span>
                      <input
                        type="date"
                        value={manualStart}
                        onChange={(e) => setManualStart(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Periode Akhir</span>
                      <input
                        type="date"
                        value={manualEnd}
                        onChange={(e) => setManualEnd(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium text-slate-700">Karyawan</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1.5">Nama</th>
                            <th className="px-2 py-1.5 w-32">Hari Kerja</th>
                            <th className="px-2 py-1.5 w-32">Jam Lembur</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-2 py-1">
                                <input
                                  type="text"
                                  value={row.nama}
                                  onChange={(e) => updateRow(idx, { nama: e.target.value })}
                                  placeholder="contoh: MAULANA"
                                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={row.hariKerja}
                                  onChange={(e) => updateRow(idx, { hariKerja: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.jamLembur}
                                  onChange={(e) => updateRow(idx, { jamLembur: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1">
                                {manualRows.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRow(idx)}
                                    aria-label="Hapus baris"
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      onClick={addRow}
                      className="mt-2 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-900 hover:text-slate-900"
                    >
                      + Tambah Karyawan
                    </button>
                  </div>

                  {manualError && <p className="text-sm text-red-600">{manualError}</p>}

                  <button
                    type="button"
                    onClick={handleManualSubmit}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Lanjut ke Upload Slip →
                  </button>
                </div>
              )}
            </>
          )}

          {absensiData && (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 text-sm">
                <span className="font-medium">Periode:</span>
                <span>{absensiData.periodeLabel}</span>
                <span className="text-slate-400">·</span>
                <span>{absensiData.nDays} hari</span>
                <button
                  onClick={reset}
                  className="ml-auto rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                >
                  Reset
                </button>
              </div>

              {absensiData.holidays.length > 0 && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-sm text-slate-600">
                    Hari libur dalam periode ({absensiData.holidays.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {absensiData.holidays.map((h) => (
                      <li key={h.date}>
                        {h.date} - {h.name}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Departemen</th>
                      <th className="px-3 py-2 text-right">Hari Kerja</th>
                      <th className="px-3 py-2 text-right">Total Aktual</th>
                      <th className="px-3 py-2 text-right">Threshold</th>
                      <th className="px-3 py-2 text-right">Jam Kerja</th>
                      <th className="px-3 py-2 text-right">Jam Lembur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absensiData.employees.map((e) => {
                      const muted = e.hariKerja === 0;
                      return (
                        <tr key={e.id} className={`border-b border-slate-100 ${muted ? "text-slate-400" : ""}`}>
                          <td className="px-3 py-2">{e.id}</td>
                          <td className="px-3 py-2 font-medium">{e.nama || "-"}</td>
                          <td className="px-3 py-2">{e.dept || "-"}</td>
                          <td className="px-3 py-2 text-right">{e.hariKerja}</td>
                          <td className="px-3 py-2 text-right">{e.totalJamAktual.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{e.threshold}</td>
                          <td className="px-3 py-2 text-right font-medium">{e.jamKerja.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-medium text-amber-700">{e.jamLembur.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {employeesNoAttendance.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Karyawan tanpa kehadiran ({employeesNoAttendance.length}) tidak akan diproses:
                  {" "}
                  {employeesNoAttendance.map((e) => e.nama || `ID ${e.id}`).join(", ")}
                </p>
              )}
            </div>
          )}
        </section>

        {/* STEP 2 */}
        {absensiData && employeesWithAttendance.length > 0 && (
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-medium">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                2
              </span>
              Upload Slip Bulan Sebelumnya
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              Upload file slip bulan lalu (.xlsx atau .pdf) per karyawan. <b>XLSX:</b>
              modifikasi langsung dengan format terjaga. <b>PDF:</b> parse data lalu generate
              slip XLSX baru dari template bawaan (format mungkin berbeda dari aslinya).
            </p>

            <div className="space-y-4">
              {employeesWithAttendance.map((emp) => {
                const up = slipUploads[emp.id];
                return (
                  <div key={emp.id} className="rounded-md border border-slate-200 p-4">
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-base font-medium">{emp.nama}</span>
                      {emp.dept && <span className="text-xs text-slate-500">ID {emp.id} · {emp.dept}</span>}
                      <span className="ml-auto text-sm text-slate-700">
                        Hari: <b>{emp.hariKerja}</b> · Jam Kerja: <b>{emp.jamKerja.toFixed(2)}</b> · Lembur: <b className="text-amber-700">{emp.jamLembur.toFixed(2)}</b>
                      </span>
                    </div>

                    <input
                      type="file"
                      accept=".xlsx,.pdf,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleSlipUpload(emp, f);
                      }}
                      className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200 file:cursor-pointer"
                    />

                    {up?.processing && <p className="mt-2 text-xs text-slate-500">Memproses…</p>}

                    {up?.error && (
                      <p className="mt-2 text-xs text-red-600">Error: {up.error}</p>
                    )}

                    {up?.result && (
                      <div className="mt-3 rounded-md bg-emerald-50 p-3 text-xs">
                        <div className="mb-1 font-medium text-emerald-800">
                          Berhasil dimodifikasi: {up.result.info.fileName}
                        </div>
                        <ul className="ml-4 list-disc space-y-0.5 text-emerald-900">
                          {up.result.info.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                        {up.result.info.warnings.length > 0 && (
                          <ul className="mt-2 ml-4 list-disc space-y-0.5 text-amber-800">
                            {up.result.info.warnings.map((w, i) => (
                              <li key={i}>Peringatan: {w}</li>
                            ))}
                          </ul>
                        )}
                        <button
                          onClick={() => downloadBlob(up.result!.blob, up.result!.info.fileName)}
                          className="mt-3 inline-flex items-center rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                        >
                          Download {up.result.info.fileName}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">
          Diproses 100% di browser — file tidak diunggah ke server.
        </footer>
      </main>
    </div>
  );
}
