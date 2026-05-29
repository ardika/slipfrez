import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedSlipData {
  nama?: string;
  jabatan?: string;
  status?: string;
  gajiPokokLabel?: string;     // e.g. "Gaji Pokok" or "Gaji Pokok (5/21hr)"
  gajiPokokNominal?: number;
  gajiPokokDailyRate?: number; // dihitung dari ratio (N/M hr) jika ada
  gajiPokokDenom?: number;     // M dari (N/M hr)
  components: { label: string; nominal: number }[];
  bankLine?: string;
  rawText: string;
  warnings: string[];
}

function parseRupiah(s: string): number | null {
  const t = s.replace(/[Rp.\s]/g, "").replace(/,(\d{2})$/, ""); // strip Rp, dots, trailing decimal
  const cleaned = t.replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

const KNOWN_COMPONENT_RX = [
  /Bonus\s+Digital\s+Marketing[^0-9\n]*/i,
  /Bonus\s+Sebar\s+Brosur/i,
  /Bonus\s+Sebar\s+Galon\s+Dekat/i,
  /Bonus\s+Sebar\s+Galon\s+Jauh/i,
  /Bonus\s+Sebar\s+Galon\s+Bersama/i,
  /Bonus\s+Google\s+Review/i,
  /Lain[- ]lain[^0-9\n]*\(Sembako\)/i,
  /Tunjangan\s+Supervisi[^0-9\n]*/i,
];

export async function extractPdfSlip(file: File): Promise<ExtractedSlipData> {
  const buf = await file.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const rawText = Array.isArray(text) ? text.join("\n") : text;

  const warnings: string[] = [];
  const out: ExtractedSlipData = {
    components: [],
    rawText,
    warnings,
  };

  // Karyawan / Nama
  const namaMatch = rawText.match(/Karyawan\s*[:\-]?\s*([A-Z][A-Za-z' \.]+?)(?:\s*\n|\s{2,}|Jabatan|Status|$)/);
  if (namaMatch) out.nama = namaMatch[1].trim();
  else warnings.push("Nama karyawan tidak ditemukan.");

  // Jabatan
  const jabatanMatch = rawText.match(/Jabatan\s*[:\-]?\s*([A-Za-z ]+?)(?:\s*\n|\s{2,}|Status|$)/);
  if (jabatanMatch) out.jabatan = jabatanMatch[1].trim();

  // Status
  const statusMatch = rawText.match(/Status\s*[:\-]?\s*([A-Za-z ]+?)(?:\s*\n|\s{2,}|PENERIMAAN|$)/);
  if (statusMatch) out.status = statusMatch[1].trim();

  // Gaji Pokok dengan ratio (N/M hr)
  const ratioMatch = rawText.match(/Gaji\s*Pokok\s*\((\d+)\s*\/\s*(\d+)\s*hr?\)[^\d]*([\d.,]+)/i);
  if (ratioMatch) {
    const n = parseInt(ratioMatch[1], 10);
    const m = parseInt(ratioMatch[2], 10);
    const nominal = parseRupiah(ratioMatch[3]);
    if (nominal !== null) {
      out.gajiPokokLabel = `Gaji Pokok (${n}/${m}hr)`;
      out.gajiPokokNominal = nominal;
      out.gajiPokokDenom = m;
      if (n > 0) out.gajiPokokDailyRate = Math.round(nominal / n);
    }
  } else {
    // Gaji Pokok tanpa ratio
    const plain = rawText.match(/Gaji\s*Pokok[^\d]*([\d.,]+)/i);
    if (plain) {
      const nominal = parseRupiah(plain[1]);
      if (nominal !== null) {
        out.gajiPokokLabel = "Gaji Pokok";
        out.gajiPokokNominal = nominal;
      }
    } else {
      warnings.push("Gaji Pokok tidak ditemukan.");
    }
  }

  // Komponen lain yang dikenal
  for (const rx of KNOWN_COMPONENT_RX) {
    const m = rawText.match(new RegExp(rx.source + "[^\\d]*?([\\d.,]+)", rx.flags));
    if (m) {
      const nominal = parseRupiah(m[1]);
      if (nominal !== null && nominal > 0) {
        const label = m[0].split(/[\d.,]/)[0].trim();
        out.components.push({ label, nominal });
      }
    }
  }

  // Bank line
  const bankMatch = rawText.match(/TRANSFER\s+KE\s+([^\n]+)/i);
  if (bankMatch) out.bankLine = bankMatch[0].trim();

  return out;
}
