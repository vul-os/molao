/**
 * The court registry for the `ZA` region profile — the demo backend's data.
 *
 * This lives under `demo/` and nowhere else on purpose. Molao is
 * region-agnostic: South Africa is the first region profile, not the product.
 * The UI must never hold a table of court names, because the next profile's
 * courts are not in it. Court names, tiers and seats reach the UI only through
 * `/api/courts` and the `court_name` field on responses.
 *
 * It mirrors `molao_core::court::COURTS` because the demo backend stands in for
 * a node that would serve exactly that.
 */

import type { Tier } from '../api';

export interface CourtInfo {
  code: string;
  name: string;
  tier: Tier;
  seat: string | null;
}

export const COURTS: CourtInfo[] = [
  { code: 'ZACC', name: 'Constitutional Court of South Africa', tier: 'apex', seat: 'Johannesburg' },
  { code: 'ZASCA', name: 'Supreme Court of Appeal of South Africa', tier: 'appellate', seat: 'Bloemfontein' },
  { code: 'ZALAC', name: 'Labour Appeal Court of South Africa', tier: 'specialist_appellate', seat: null },
  { code: 'ZACAC', name: 'Competition Appeal Court of South Africa', tier: 'specialist_appellate', seat: null },
  { code: 'ZAGPPHC', name: 'High Court of South Africa, Gauteng Division', tier: 'high_court', seat: 'Pretoria' },
  { code: 'ZAGPJHC', name: 'High Court of South Africa, Gauteng Local Division', tier: 'high_court', seat: 'Johannesburg' },
  { code: 'ZAWCHC', name: 'High Court of South Africa, Western Cape Division', tier: 'high_court', seat: 'Cape Town' },
  { code: 'ZAKZDHC', name: 'High Court of South Africa, KwaZulu-Natal Local Division', tier: 'high_court', seat: 'Durban' },
  { code: 'ZAKZPHC', name: 'High Court of South Africa, KwaZulu-Natal Division', tier: 'high_court', seat: 'Pietermaritzburg' },
  { code: 'ZAECGHC', name: 'High Court of South Africa, Eastern Cape Division', tier: 'high_court', seat: 'Grahamstown' },
  { code: 'ZAECPEHC', name: 'High Court of South Africa, Eastern Cape Local Division', tier: 'high_court', seat: 'Gqeberha' },
  { code: 'ZAECBHC', name: 'High Court of South Africa, Eastern Cape Local Division', tier: 'high_court', seat: 'Bhisho' },
  { code: 'ZAECMHC', name: 'High Court of South Africa, Eastern Cape Local Division', tier: 'high_court', seat: 'Mthatha' },
  { code: 'ZAFSHC', name: 'High Court of South Africa, Free State Division', tier: 'high_court', seat: 'Bloemfontein' },
  { code: 'ZANWHC', name: 'High Court of South Africa, North West Division', tier: 'high_court', seat: 'Mahikeng' },
  { code: 'ZANCHC', name: 'High Court of South Africa, Northern Cape Division', tier: 'high_court', seat: 'Kimberley' },
  { code: 'ZALMPPHC', name: 'High Court of South Africa, Limpopo Division', tier: 'high_court', seat: 'Polokwane' },
  { code: 'ZALMPTHC', name: 'High Court of South Africa, Limpopo Local Division', tier: 'high_court', seat: 'Thohoyandou' },
  { code: 'ZAMPMBHC', name: 'High Court of South Africa, Mpumalanga Division', tier: 'high_court', seat: 'Mbombela' },
  { code: 'ZAMPMHC', name: 'High Court of South Africa, Mpumalanga Local Division', tier: 'high_court', seat: 'Middelburg' },
  { code: 'ZALC', name: 'Labour Court of South Africa', tier: 'specialist_high', seat: null },
  { code: 'ZALCJHB', name: 'Labour Court of South Africa', tier: 'specialist_high', seat: 'Johannesburg' },
  { code: 'ZALCCT', name: 'Labour Court of South Africa', tier: 'specialist_high', seat: 'Cape Town' },
  { code: 'ZALCD', name: 'Labour Court of South Africa', tier: 'specialist_high', seat: 'Durban' },
  { code: 'ZALCPE', name: 'Labour Court of South Africa', tier: 'specialist_high', seat: 'Gqeberha' },
  { code: 'ZALCC', name: 'Land Claims Court of South Africa', tier: 'specialist_high', seat: null },
  { code: 'ZATC', name: 'Tax Court of South Africa', tier: 'specialist_high', seat: null },
  { code: 'ZAEC', name: 'Electoral Court of South Africa', tier: 'specialist_high', seat: null },
  { code: 'ZACT', name: 'Competition Tribunal of South Africa', tier: 'tribunal', seat: null },
  { code: 'ZAWT', name: 'Water Tribunal of South Africa', tier: 'tribunal', seat: null },
  { code: 'ZACGSO', name: 'Companies Tribunal of South Africa', tier: 'tribunal', seat: null },
  { code: 'ZAICT', name: 'Information Regulator of South Africa', tier: 'tribunal', seat: null },
];

const BY_CODE = new Map(COURTS.map((c) => [c.code, c]));

export function lookupCourt(code: string): CourtInfo | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function courtName(code: string): string {
  return lookupCourt(code)?.name ?? code;
}

/** Unknown codes get the floor — unknown is not the same as unimportant. */
export function authorityWeight(code: string): number {
  return tierWeight(lookupCourt(code)?.tier ?? 'lower');
}

export function tierWeight(tier: Tier): number {
  switch (tier) {
    case 'apex':
      return 1.0;
    case 'appellate':
      return 0.8;
    case 'specialist_appellate':
      return 0.65;
    case 'high_court':
      return 0.5;
    case 'specialist_high':
      return 0.45;
    case 'tribunal':
      return 0.2;
    case 'lower':
      return 0.1;
  }
}

