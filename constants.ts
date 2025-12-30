
import { ComponentKey } from './types';

export const COMPONENTS: ComponentKey[] = ['AR', 'C2H6', 'CH4', 'CO', 'CO2', 'H2', 'N2', 'NH3', 'O2', 'H2O'];

export const MOLECULAR_WEIGHTS: Record<ComponentKey, number> = {
  AR: 39,
  C2H6: 30,
  CH4: 16,
  CO: 28,
  CO2: 44,
  H2: 2,
  N2: 28,
  NH3: 17,
  O2: 32,
  H2O: 18
};

export const CONVERSION_FACTOR = 22.414; // Kgmol/hr to NMC/hr

export const INITIAL_MOLES: Record<ComponentKey, number> = {
  AR: 0,
  C2H6: 2.5,
  CH4: 95.0,
  CO: 0,
  CO2: 0.5,
  H2: 2.0,
  N2: 0,
  NH3: 0,
  O2: 0,
  H2O: 350.0 // Excess steam
};

export const AIR_COMPOSITION = {
  N2: 0.7808,
  O2: 0.2095,
  AR: 0.0097
};
