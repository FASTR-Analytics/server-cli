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
  openAccess?: boolean;
  tags?: string[];
  mode?: "central";
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};