export type Server = {
  id: string;
  label: string;
  port: number;
  instanceDir?: string;
  serverVersion: string;
  adminVersion?: string;
  french?: boolean;
  ethiopian?: boolean;
  openAccess?: boolean;
  tags?: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};