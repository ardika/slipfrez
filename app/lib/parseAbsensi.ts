import * as XLSX from "xlsx";
import { AbsensiData, EmployeeCalc, DayResult } from "./types";
import { getHolidayMap } from "./holidays";

const NORMAL_HOURS_PER_DAY = 8;
const NORMAL_MIN_PER_DAY = NORMAL_HOURS_PER_DAY * 60;

const WEEKDAY_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function parsePunchString(s: string): number[] {
  const trimmed = (s ?? "").trim();
  if (!trimmed) return [];
  const out: number[] = [];
  for (let i = 0; i + 5 <= trimmed.length; i += 5) {
    const chunk = trimmed.substring(i, i + 5);
    if (chunk.length === 5 && chunk[2] === ":") {
      const hh = parseInt(chunk.slice(0, 2), 10);
      const mm = parseInt(chunk.slice(3), 10);
      if (!isNaN(hh) && !isNaN(mm)) out.push(hh * 60 + mm);
    }
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function parsePeriode(headerCell: string): { start: Date; end: Date } | null {
  // Format: "2026-03-29 ~ 2026-04-28"
  const m = (headerCell || "").match(/(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, sy, sm, sd, ey, em, ed] = m;
  return {
    start: new Date(Date.UTC(+sy, +sm - 1, +sd)),
    end: new Date(Date.UTC(+ey, +em - 1, +ed)),
  };
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export async function parseAbsensiXls(
  file: File,
  extraHolidays: { date: string; name: string }[] = [],
): Promise<AbsensiData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Sheet "Lap. Log Absen" biasanya index 2
  const targetName = wb.SheetNames.find((n) => /log\s*absen/i.test(n)) ?? wb.SheetNames[2] ?? wb.SheetNames[0];
  const ws = wb.Sheets[targetName];
  if (!ws) throw new Error(`Sheet "Lap. Log Absen" tidak ditemukan.`);
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Cari header periode di kolom 0..ncols pada baris dengan teks "Waktu Absen"
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  for (const row of grid) {
    if (!row) continue;
    for (const cell of row) {
      const txt = String(cell ?? "");
      const p = parsePeriode(txt);
      if (p) {
        periodStart = p.start;
        periodEnd = p.end;
        break;
      }
    }
    if (periodStart) break;
  }
  if (!periodStart || !periodEnd) {
    throw new Error("Periode tidak terdeteksi di sheet (cari format 'YYYY-MM-DD ~ YYYY-MM-DD').");
  }
  const nDays = Math.round((+periodEnd - +periodStart) / 86_400_000) + 1;

  // Bangun daftar libur untuk rentang periode (Minggu + libur nasional)
  const holidayMap = getHolidayMap(extraHolidays);
  const holidaysInPeriod: { date: string; name: string }[] = [];
  for (let i = 0; i < nDays; i++) {
    const d = new Date(periodStart.getTime() + i * 86_400_000);
    const key = ymd(d);
    if (d.getUTCDay() === 0) holidaysInPeriod.push({ date: key, name: "Hari Minggu" });
    else if (holidayMap.has(key)) holidaysInPeriod.push({ date: key, name: holidayMap.get(key)! });
  }

  // Cari baris-baris karyawan: kolom 0 = "ID:", kolom 2 = id, kolom 10 = nama, kolom 20 = dept
  const employees: EmployeeCalc[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    if (String(row[0] ?? "").trim() !== "ID:") continue;
    const id = String(row[2] ?? "").trim();
    const nama = String(row[10] ?? "").trim();
    const dept = String(row[20] ?? "").trim();
    const punchRow = grid[r + 1] ?? [];

    const days: DayResult[] = [];
    let hariKerja = 0;
    let totalMin = 0;
    for (let i = 0; i < nDays; i++) {
      const cell = String(punchRow[i] ?? "");
      const times = parsePunchString(cell);
      const d = new Date(periodStart.getTime() + i * 86_400_000);
      const dateStr = ymd(d);
      const wk = WEEKDAY_ID[d.getUTCDay()];
      const isMinggu = d.getUTCDay() === 0;
      const natlName = holidayMap.get(dateStr);
      const isHoliday = isMinggu || !!natlName;
      const holidayName = natlName ?? (isMinggu ? "Hari Minggu" : undefined);

      let jamAktual = 0;
      let modeLabel = "";
      if (times.length === 1) {
        jamAktual = NORMAL_MIN_PER_DAY / 60;
        modeLabel = "1 punch (asumsi 8 jam)";
        hariKerja += 1;
        totalMin += NORMAL_MIN_PER_DAY;
      } else if (times.length >= 2) {
        const mins = times[times.length - 1] - times[0];
        jamAktual = mins / 60;
        modeLabel = `${times.length} punch`;
        hariKerja += 1;
        totalMin += mins;
      }

      days.push({
        date: dateStr,
        weekday: wk,
        isHoliday,
        holidayName,
        punches: times,
        modeLabel,
        jamAktual: +jamAktual.toFixed(2),
      });
    }

    const threshold = hariKerja * NORMAL_HOURS_PER_DAY;
    const totalJam = totalMin / 60;
    const jamKerja = totalJam >= threshold ? threshold : totalJam;
    const jamLembur = totalJam >= threshold ? totalJam - threshold : 0;

    employees.push({
      id,
      nama,
      dept,
      hariKerja,
      totalJamAktual: +totalJam.toFixed(2),
      threshold,
      jamKerja: +jamKerja.toFixed(2),
      jamLembur: +jamLembur.toFixed(2),
      daysDetail: days,
    });
  }

  const fmtDate = (d: Date) => {
    const day = d.getUTCDate();
    const monShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getUTCMonth()];
    return `${day} ${monShort} ${d.getUTCFullYear()}`;
  };

  return {
    periodeLabel: `${fmtDate(periodStart)} - ${fmtDate(periodEnd)}`,
    startDate: ymd(periodStart),
    endDate: ymd(periodEnd),
    nDays,
    holidays: holidaysInPeriod,
    employees,
  };
}
