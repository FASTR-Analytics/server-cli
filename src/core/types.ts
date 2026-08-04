export const FISCAL_YEARS = ["none", "july"] as const;

export type FiscalYear = (typeof FISCAL_YEARS)[number];

export type Server = {
  id: string;
  label: string;
  port: number;
  instanceDir?: string;
  volume?: string;
  serverVersion: string;
  adminVersion?: string;
  french?: boolean;
  portuguese?: boolean;
  ethiopian?: boolean;
  fiscalYear?: FiscalYear;
  countryIso3?: string;
  openAccess?: boolean;
  tags?: string[];
  mode?: "central";
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};