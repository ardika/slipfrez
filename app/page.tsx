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

export default function Home() {
  const [absensiData, setAbsensiData] = useState<AbsensiData | null>(null);
  const [absensiError, setAbsensiError] = useState<string | null>(null);
  const [absensiLoading, setAbsensiLoading] = useState(false);
  const [slipUploads, setSlipUploads] = useState<Record<string, SlipUpload>>({});

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
  }

  const employeesWithAttendance = absensiData?.employees.filter((e) => e.hariKerja > 0) ?? [];
  const employeesNoAttendance = absensiData?.employees.filter((e) => e.hariKerja === 0) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Slip Gaji FREZ</h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload laporan absensi (.xls), aplikasi akan menghitung hari kerja, jam kerja, dan
            jam lembur, lalu memodifikasi slip gaji bulan sebelumnya untuk tiap karyawan
            terdeteksi.
          </p>
        </header>

        {/* STEP 1 */}
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              1
            </span>
            Upload Laporan Absensi (.xls)
          </h2>

          {!absensiData && (
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
              Untuk setiap karyawan, upload file slip gaji bulan lalu (.xlsx). Aplikasi akan
              meng-update Periode, Hari Kehadiran, Jam Lembur (dan Gaji Pokok pro-rata bila
              menggunakan format <code className="rounded bg-slate-100 px-1">(N/M hr)</code>).
            </p>

            <div className="space-y-4">
              {employeesWithAttendance.map((emp) => {
                const up = slipUploads[emp.id];
                return (
                  <div key={emp.id} className="rounded-md border border-slate-200 p-4">
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-base font-medium">{emp.nama}</span>
                      <span className="text-xs text-slate-500">ID {emp.id} · {emp.dept}</span>
                      <span className="ml-auto text-sm text-slate-700">
                        Hari: <b>{emp.hariKerja}</b> · Jam Kerja: <b>{emp.jamKerja.toFixed(2)}</b> · Lembur: <b className="text-amber-700">{emp.jamLembur.toFixed(2)}</b>
                      </span>
                    </div>

                    <input
                      type="file"
                      accept=".xlsx"
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
