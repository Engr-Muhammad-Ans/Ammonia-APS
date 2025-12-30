
export type ComponentKey = 'AR' | 'C2H6' | 'CH4' | 'CO' | 'CO2' | 'H2' | 'N2' | 'NH3' | 'O2' | 'H2O';

export interface StreamData {
  moles: Record<ComponentKey, number>; // Kgmol/hr
  totalMoles: number;
  totalVolume: number; // NMC/hr
  moleFractions: Record<ComponentKey, number>;
}

export type EquipmentType = 'Primary Reformer' | 'Secondary Reformer' | 'HTS' | 'LTS' | 'Methanator' | 'Ammonia Reactor';

export interface EquipmentState {
  name: EquipmentType;
  inlet: StreamData;
  outlet: StreamData;
  parameters: Record<string, number>;
}

export interface PlantState {
  primaryReformer: EquipmentState;
  secondaryReformer: EquipmentState;
  hts: EquipmentState;
  lts: EquipmentState;
  methanator: EquipmentState;
  ammoniaReactor: EquipmentState;
}
