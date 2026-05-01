import ExcelJS from "exceljs";
import { EmployeeCalc } from "./types";

export interface SlipUpdateInfo {
  fileName: string;
  changes: string[];
  warnings: string[];
}

const TUNJANGAN_RX = /tunjangan\s*kehadiran/i;
const LEMBUR_RX = /\blembur\b/i;
const PERIODE_RX = /^periode$/i;
const GAJIPOKOK_RX = /gaji\s*pokok/i;
const RATIO_RX = /\((\d+)\s*\/\s*(\d+)\s*hr?\)/i;

export async function modifySlipForEmployee(
  file: File,
  emp: EmployeeCalc,
  periodeLabel: string,
): Promise<{ blob: Blob; info: SlipUpdateInfo }> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const changes: string[] = [];
  const warnings: string[] = [];

  let foundTunjangan = false;
  let foundLembur = false;
  let foundPeriode = false;

  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      // Periode label di kolom F (6) -> isi di kolom H (8) pada baris yg sama
      const fCell = row.getCell(6);
      if (typeof fCell.value === "string" && PERIODE_RX.test(fCell.value.trim())) {
        const hCell = row.getCell(8);
        // Hapus formula, isi text statis
        hCell.value = periodeLabel;
        changes.push(`${ws.name}!${hCell.address}: Periode = "${periodeLabel}"`);
        foundPeriode = true;
      }

      // Label di kolom C (3); count di kolom E (5)
      const cCell = row.getCell(3);
      const cVal = typeof cCell.value === "string" ? cCell.value : "";
      if (cVal) {
        if (TUNJANGAN_RX.test(cVal)) {
          const eCell = row.getCell(5);
          eCell.value = emp.hariKerja;
          changes.push(`${ws.name}!${eCell.address}: Hari Kehadiran = ${emp.hariKerja}`);
          foundTunjangan = true;
        }
        if (LEMBUR_RX.test(cVal)) {
          const eCell = row.getCell(5);
          eCell.value = emp.jamLembur;
          changes.push(
            `${ws.name}!${eCell.address}: Jam Lembur = ${emp.jamLembur} (Rp ${(emp.jamLembur * 8000).toLocaleString("id-ID")})`,
          );
          foundLembur = true;
        }
        if (GAJIPOKOK_RX.test(cVal)) {
          const ratioMatch = cVal.match(RATIO_RX);
          if (ratioMatch) {
            const oldNum = parseInt(ratioMatch[1], 10);
            const denom = parseInt(ratioMatch[2], 10);
            const jCell = row.getCell(10);
            const oldNominal =
              typeof jCell.value === "number" ? (jCell.value as number) :
              jCell.value && typeof jCell.value === "object" && "result" in (jCell.value as object) ? Number((jCell.value as { result?: number }).result ?? 0) : 0;
            if (oldNum > 0 && oldNominal > 0) {
              const dailyRate = oldNominal / oldNum;
              const newLabel = cVal.replace(RATIO_RX, `(${emp.hariKerja}/${denom}hr)`);
              const newNominal = Math.round(dailyRate * emp.hariKerja);
              cCell.value = newLabel;
              jCell.value = newNominal;
              changes.push(
                `${ws.name}!${cCell.address}: Label Gaji Pokok diubah ke "${newLabel}"`,
              );
              changes.push(
                `${ws.name}!${jCell.address}: Gaji Pokok = Rp ${newNominal.toLocaleString("id-ID")} (${emp.hariKerja} x ${dailyRate.toLocaleString("id-ID")})`,
              );
            }
          }
        }
      }
    });
  }

  if (!foundTunjangan) warnings.push("Label 'Tunjangan Kehadiran' tidak ditemukan - hari kerja tidak terupdate.");
  if (!foundLembur) warnings.push("Label 'Lembur' tidak ditemukan - jam lembur tidak terupdate.");
  if (!foundPeriode) warnings.push("Label 'Periode' tidak ditemukan - periode tidak terupdate.");

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Filename: slipFrez<NamaPertama>-<Bulan>-<Tahun>.xlsx (berdasarkan periode end)
  const monthYearFromPeriode = (() => {
    const m = periodeLabel.match(/(\d+)\s+(\w+)\s+(\d{4})\s*-\s*(\d+)\s+(\w+)\s+(\d{4})/);
    if (m) return `${m[5]}-${m[6]}`;
    return "Periode";
  })();
  const namaSafe = (emp.nama || "Karyawan").split(" ")[0].replace(/[^A-Za-z0-9]/g, "");
  const fileName = `slipFrez${namaSafe}-${monthYearFromPeriode}.xlsx`;

  return {
    blob,
    info: { fileName, changes, warnings },
  };
}
