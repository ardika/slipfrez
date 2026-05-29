import ExcelJS from "exceljs";
import { EmployeeCalc } from "./types";
import { ExtractedSlipData } from "./extractPdfSlip";
import { SlipUpdateInfo } from "./modifySlip";

const TUNJANGAN_HARIAN = 20000;
const LEMBUR_PERJAM = 8000;

export async function buildSlipFromTemplate(
  emp: EmployeeCalc,
  periodeLabel: string,
  extracted: ExtractedSlipData,
): Promise<{ blob: Blob; info: SlipUpdateInfo }> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("GAJI");

  // Width kolom dasar
  ws.getColumn(1).width = 3;   // A: dash/list marker col
  ws.getColumn(2).width = 4;
  ws.getColumn(3).width = 28;  // C: label
  ws.getColumn(4).width = 4;
  ws.getColumn(5).width = 6;   // E: count
  ws.getColumn(6).width = 6;   // F: 'x'
  ws.getColumn(7).width = 8;
  ws.getColumn(8).width = 12;  // H: rate
  ws.getColumn(9).width = 4;
  ws.getColumn(10).width = 14; // J: nominal

  const changes: string[] = [];
  const warnings: string[] = [...extracted.warnings];

  // Title
  ws.mergeCells("A1:J2");
  const title = ws.getCell("A1");
  title.value = "SLIP GAJI";
  title.font = { size: 18, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };

  // Header kiri (perusahaan)
  ws.getCell("A4").value = "DEPOT AIR SIAP MINUM FREZ";
  ws.getCell("A4").font = { bold: true };
  ws.getCell("A5").value = "GAGAKSIPAT";
  ws.getCell("A6").value = "Ngemplak";
  ws.getCell("A7").value = "Boyolali";

  // Header kanan (info karyawan)
  ws.getCell("F4").value = "Periode";
  ws.getCell("H4").value = periodeLabel;
  ws.getCell("F5").value = "Karyawan";
  ws.getCell("H5").value = emp.nama || extracted.nama || "-";
  ws.getCell("F6").value = "Jabatan";
  ws.getCell("H6").value = extracted.jabatan || "Staff";
  ws.getCell("F7").value = "Status";
  ws.getCell("H7").value = extracted.status || "Full Time";
  for (const a of ["F4", "F5", "F6", "F7"]) ws.getCell(a).font = { bold: true };

  // PENERIMAAN section
  ws.getCell("B9").value = "PENERIMAAN";
  ws.getCell("B9").font = { bold: true };

  let row = 10;
  const incomeStart = row;

  // Gaji Pokok (pro-rata bila punya ratio)
  let gajiPokokFinal = 0;
  let gajiPokokLabel = extracted.gajiPokokLabel || "Gaji Pokok";
  if (extracted.gajiPokokDailyRate && extracted.gajiPokokDenom) {
    gajiPokokLabel = `Gaji Pokok (${emp.hariKerja}/${extracted.gajiPokokDenom}hr)`;
    gajiPokokFinal = Math.round(extracted.gajiPokokDailyRate * emp.hariKerja);
    changes.push(`Gaji Pokok pro-rata: ${emp.hariKerja} x Rp ${extracted.gajiPokokDailyRate.toLocaleString("id-ID")} = Rp ${gajiPokokFinal.toLocaleString("id-ID")}`);
  } else if (extracted.gajiPokokNominal) {
    gajiPokokFinal = extracted.gajiPokokNominal;
    changes.push(`Gaji Pokok dari PDF: Rp ${gajiPokokFinal.toLocaleString("id-ID")}`);
  } else {
    warnings.push("Gaji Pokok tidak terdeteksi - diisi 0, mohon update manual.");
  }
  ws.getCell(`B${row}`).value = "-";
  ws.getCell(`C${row}`).value = gajiPokokLabel;
  ws.getCell(`J${row}`).value = gajiPokokFinal;
  row++;

  // Komponen lain dari PDF
  for (const comp of extracted.components) {
    ws.getCell(`B${row}`).value = "-";
    ws.getCell(`C${row}`).value = comp.label;
    ws.getCell(`J${row}`).value = comp.nominal;
    row++;
  }

  // Tunjangan Kehadiran
  ws.getCell(`B${row}`).value = "-";
  ws.getCell(`C${row}`).value = "Tunjangan Kehadiran Per Hari";
  ws.getCell(`E${row}`).value = emp.hariKerja;
  ws.getCell(`F${row}`).value = "x";
  ws.getCell(`H${row}`).value = TUNJANGAN_HARIAN;
  ws.getCell(`J${row}`).value = { formula: `H${row}*E${row}` };
  changes.push(`Tunjangan Kehadiran: ${emp.hariKerja} x Rp ${TUNJANGAN_HARIAN.toLocaleString("id-ID")}`);
  row++;

  // Lembur
  ws.getCell(`B${row}`).value = "-";
  ws.getCell(`C${row}`).value = "Lembur (perjam)";
  ws.getCell(`E${row}`).value = emp.jamLembur;
  ws.getCell(`F${row}`).value = "x";
  ws.getCell(`H${row}`).value = LEMBUR_PERJAM;
  ws.getCell(`J${row}`).value = { formula: `H${row}*E${row}` };
  changes.push(`Lembur: ${emp.jamLembur} jam x Rp ${LEMBUR_PERJAM.toLocaleString("id-ID")}`);
  row++;

  const incomeEnd = row - 1;

  // Total Penghasilan Bruto
  ws.getCell(`B${row}`).value = "Total Penghasilan Bruto";
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`J${row}`).value = { formula: `SUM(J${incomeStart}:J${incomeEnd})` };
  ws.getCell(`J${row}`).font = { bold: true };
  const totalBrutoRow = row;
  row += 2;

  // PENGURANGAN
  ws.getCell(`B${row}`).value = "PENGURANGAN";
  ws.getCell(`B${row}`).font = { bold: true };
  row++;
  const deductStart = row;
  ws.getCell(`B${row}`).value = "-";
  ws.getCell(`C${row}`).value = "Angsuran";
  ws.getCell(`J${row}`).value = 0;
  row++;
  ws.getCell(`B${row}`).value = "-";
  ws.getCell(`C${row}`).value = "Potongan keterlambatan";
  ws.getCell(`J${row}`).value = 0;
  row++;
  const deductEnd = row - 1;
  ws.getCell(`B${row}`).value = "Total Pengurangan";
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`J${row}`).value = { formula: `SUM(J${deductStart}:J${deductEnd})` };
  ws.getCell(`J${row}`).font = { bold: true };
  const totalPengRow = row;
  row += 2;

  // TOTAL DITERIMA
  ws.getCell(`B${row}`).value = "TOTAL DITERIMA KARYAWAN";
  ws.getCell(`B${row}`).font = { bold: true, size: 12 };
  ws.getCell(`J${row}`).value = { formula: `J${totalBrutoRow}-J${totalPengRow}` };
  ws.getCell(`J${row}`).font = { bold: true, size: 12 };
  row += 2;

  // Transfer bank
  if (extracted.bankLine) {
    ws.getCell(`B${row}`).value = extracted.bankLine;
    ws.getCell(`B${row}`).font = { italic: true };
  } else {
    ws.getCell(`B${row}`).value = "TRANSFER KE [BANK] [NO. REKENING] a/n " + (emp.nama || extracted.nama || "-");
    ws.getCell(`B${row}`).font = { italic: true };
    warnings.push("Info transfer bank tidak terdeteksi - mohon isi manual.");
  }
  row += 3;

  // Footer signature
  ws.getCell(`C${row}`).value = "Penerima";
  ws.getCell(`I${row}`).value = "FREZ";
  row += 6;
  ws.getCell(`C${row}`).value = emp.nama || extracted.nama || "-";
  ws.getCell(`I${row}`).value = "Nurkholish Ardi Firdaus";

  // Format Rupiah pada kolom J
  ws.getColumn(10).numFmt = '#,##0;[Red]-#,##0';

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Filename: slipFrez<NamaPertama>-<Bulan>-<Tahun>.xlsx
  const monthYear = (() => {
    const m = periodeLabel.match(/(\d+)\s+(\w+)\s+(\d{4})\s*-\s*(\d+)\s+(\w+)\s+(\d{4})/);
    if (m) return `${m[5]}-${m[6]}`;
    return "Periode";
  })();
  const namaSafe = (emp.nama || extracted.nama || "Karyawan").split(" ")[0].replace(/[^A-Za-z0-9]/g, "");
  const fileName = `slipFrez${namaSafe}-${monthYear}.xlsx`;

  return {
    blob,
    info: { fileName, changes, warnings },
  };
}
