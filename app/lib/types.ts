export type Punches = string;

export interface Employee {
  id: string;
  nama: string;
  dept: string;
  punchesPerDay: Punches[];
}

export interface DayResult {
  date: string;
  weekday: string;
  isHoliday: boolean;
  holidayName?: string;
  punches: number[];
  modeLabel: string;
  jamAktual: number;
}

export interface EmployeeCalc {
  id: string;
  nama: string;
  dept: string;
  hariKerja: number;
  totalJamAktual: number;
  threshold: number;
  jamKerja: number;
  jamLembur: number;
  daysDetail: DayResult[];
}

export interface AbsensiData {
  periodeLabel: string;
  startDate: string;
  endDate: string;
  nDays: number;
  holidays: { date: string; name: string }[];
  employees: EmployeeCalc[];
}
