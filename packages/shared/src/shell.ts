export type ShellType = "AP" | "HE";

export interface ShellDefinition {
  id: string;
  name: string;
  type: ShellType;
  caliberMm: number;
  velocityMps: number;
  penetrationMm: number;
  penetrationLossPer100m?: number;
  fuseSensitivity?: number;
  explosiveMassKg?: number;
}
