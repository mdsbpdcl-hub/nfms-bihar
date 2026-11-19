// Turns the four NFMS responses for one State/DISCOM selection into one flat row.

export const STATE_NAMES = {
  ALL: 'India', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh',
  CT: 'Chhattisgarh', DL: 'Delhi', DN: 'DNH & DD', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh',
  HR: 'Haryana', JH: 'Jharkhand', JK: 'Jammu & Kashmir', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh',
  LK: 'Lakshadweep', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh', MZ: 'Mizoram',
  NL: 'Nagaland', OD: 'Odisha', PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan', SK: 'Sikkim',
  TG: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UK: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
};

export const COLUMNS = [
  'key', 'level', 'state_code', 'state', 'name', 'discom_label', 'in_discom_rank',
  'hos_incl_agri', 'hos_excl_agri', 'urban', 'rural', 'agri', 'industrial', 'mixed',
  'saidi', 'saifi', 'total_feeders', 'int_feeders', 'int_pct', 'comm_pct', 'smart_pct', 'amr_pct', 'rtdas_pct',
  'data_date',
];

const n = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const round = (x, d = 3) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
// "1045,996,23361.65,23.46" -> 23.46 (4th value is average hours)
const hrs = (s) => (typeof s === 'string' ? n(s.split(',')[3]) : null);
// "[94.54,5593]" -> 94.54
const pct = (s) => { try { const a = JSON.parse(s); return n(a[0]); } catch { return null; } };

export function buildRow(st, ds, eps, { multi = false, utility } = {}) {
  const tile = eps.DashboardTile?.Dashboard_Tile?.[0] || {};
  const td = tile.data?.[0] || {};
  const fs = eps.FeederStatsV2?.Data?.[0] || {};
  const ct = eps.FeederCommTech || {};
  const cd = ct.communication_tech?.[0] || {};
  const av = eps.AvgPowerSupDur?.AvgSupplyDuration?.[0] || {};
  const ad = av.Data?.[0] || {};

  let level, name;
  if (st === 'ALL') { level = 'National'; name = 'India (all integrated)'; }
  else if (ds === 'ALL') { level = 'State'; name = STATE_NAMES[st]; }
  else { level = 'DISCOM'; name = ds; }
  const inDiscomRank = level === 'DISCOM' || (level === 'State' && !multi);
  const discomLabel = level === 'DISCOM' ? ds : inDiscomRank ? (utility ? `${utility} (${STATE_NAMES[st]})` : `${STATE_NAMES[st]}*`) : '';
  const dateRaw = tile.dataRefresh || av.dataRefresh || '';

  return {
    key: `${st}|${ds}`, level, state_code: st, state: STATE_NAMES[st], name,
    discom_label: discomLabel, in_discom_rank: inDiscomRank ? 'yes' : 'no',
    hos_incl_agri: n(av.avgSupplyIncAG), hos_excl_agri: n(av.avgSupplyExcAG),
    urban: hrs(ad.Urban), rural: hrs(ad.Rural), agri: hrs(ad.Agricultural),
    industrial: hrs(ad.Dedicated_Industrial), mixed: hrs(ad.Mixed),
    saidi: round(n(td.saidi)), saifi: round(n(td.saifi)),
    total_feeders: n(fs.totalFeeders), int_feeders: n(fs.totalIntegrated),
    int_pct: n(fs.IntegrationPercent), comm_pct: n(fs.avgCommPercent),
    smart_pct: pct(cd.SMpercent), amr_pct: pct(cd.AMRpercent), rtdas_pct: pct(cd.RTDASpercent),
    data_date: dateRaw ? dateRaw.slice(0, 10) : '',
  };
}
