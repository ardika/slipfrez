// Hari Libur Nasional Indonesia (estimasi). User dapat menambah/menghapus via UI.
// Sumber: SKB 3 Menteri (default best-guess; verifikasi sebelum payroll resmi).
export const HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "Tahun Baru Masehi" },
  { date: "2026-02-05", name: "Isra Mi'raj Nabi Muhammad SAW" },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577" },
  { date: "2026-03-17", name: "Hari Raya Nyepi (Tahun Baru Saka 1948)" },
  { date: "2026-03-20", name: "Hari Raya Idul Fitri 1447 H (Hari ke-1)" },
  { date: "2026-03-21", name: "Hari Raya Idul Fitri 1447 H (Hari ke-2)" },
  { date: "2026-04-03", name: "Wafat Isa Almasih (Jumat Agung)" },
  { date: "2026-05-01", name: "Hari Buruh Internasional" },
  { date: "2026-05-14", name: "Kenaikan Isa Almasih" },
  { date: "2026-05-27", name: "Hari Raya Waisak 2570 BE" },
  { date: "2026-06-01", name: "Hari Lahir Pancasila" },
  { date: "2026-06-07", name: "Hari Raya Idul Adha 1447 H" },
  { date: "2026-06-27", name: "Tahun Baru Islam 1448 H" },
  { date: "2026-08-17", name: "Hari Kemerdekaan RI" },
  { date: "2026-09-05", name: "Maulid Nabi Muhammad SAW" },
  { date: "2026-12-25", name: "Hari Raya Natal" },
];

export const HOLIDAYS_2027: { date: string; name: string }[] = [
  { date: "2027-01-01", name: "Tahun Baru Masehi" },
  { date: "2027-02-06", name: "Tahun Baru Imlek 2578" },
  { date: "2027-03-09", name: "Hari Raya Idul Fitri 1448 H (Hari ke-1)" },
  { date: "2027-03-10", name: "Hari Raya Idul Fitri 1448 H (Hari ke-2)" },
  { date: "2027-03-26", name: "Wafat Isa Almasih" },
  { date: "2027-05-01", name: "Hari Buruh Internasional" },
  { date: "2027-05-06", name: "Kenaikan Isa Almasih" },
  { date: "2027-05-21", name: "Hari Raya Idul Adha 1448 H" },
  { date: "2027-06-01", name: "Hari Lahir Pancasila" },
  { date: "2027-08-17", name: "Hari Kemerdekaan RI" },
  { date: "2027-12-25", name: "Hari Raya Natal" },
];

export const ALL_HOLIDAYS = [...HOLIDAYS_2026, ...HOLIDAYS_2027];

export function getHolidayMap(extras: { date: string; name: string }[] = []) {
  const map = new Map<string, string>();
  for (const h of [...ALL_HOLIDAYS, ...extras]) map.set(h.date, h.name);
  return map;
}
