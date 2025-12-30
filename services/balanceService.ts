
import { ComponentKey, StreamData, EquipmentType } from '../types';
import { COMPONENTS, CONVERSION_FACTOR, AIR_COMPOSITION } from '../constants';

export const calculateStreamDerivedData = (moles: Record<ComponentKey, number>): StreamData => {
  const totalMoles = Object.values(moles).reduce((acc, val) => acc + val, 0);
  const totalVolume = totalMoles * CONVERSION_FACTOR;
  
  const moleFractions: Record<ComponentKey, number> = {} as any;
  COMPONENTS.forEach(comp => {
    moleFractions[comp] = totalMoles > 0 ? moles[comp] / totalMoles : 0;
  });

  return {
    moles: { ...moles },
    totalMoles,
    totalVolume,
    moleFractions
  };
};

export const calculatePrimaryReformer = (
  inletMoles: Record<ComponentKey, number>,
  ch4Conversion: number, // 0 to 1
  c2h6Conversion: number, // Usually 1.0 for primary
  coConversion: number // Shift conversion in the reformer zone
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };

  // C2H6 Reforming: C2H6 + 2H2O -> 2CO + 5H2
  const molesC2H6Reacted = inletMoles.C2H6 * c2h6Conversion;
  outlet.C2H6 -= molesC2H6Reacted;
  outlet.H2O -= 2 * molesC2H6Reacted;
  outlet.CO += 2 * molesC2H6Reacted;
  outlet.H2 += 5 * molesC2H6Reacted;

  // CH4 Reforming: CH4 + H2O -> CO + 3H2
  const molesCH4Reacted = inletMoles.CH4 * ch4Conversion;
  outlet.CH4 -= molesCH4Reacted;
  outlet.H2O -= molesCH4Reacted;
  outlet.CO += molesCH4Reacted;
  outlet.H2 += 3 * molesCH4Reacted;

  // Water Gas Shift in Reformer: CO + H2O -> CO2 + H2
  const shiftAmount = outlet.CO * coConversion;
  outlet.CO -= shiftAmount;
  outlet.H2O -= shiftAmount;
  outlet.CO2 += shiftAmount;
  outlet.H2 += shiftAmount;

  return outlet;
};

export const calculateSecondaryReformer = (
  inletMoles: Record<ComponentKey, number>,
  airMolesToAdd: Record<ComponentKey, number>,
  ch4Conversion: number,
  coConversion: number,
  o2Conversion: number // User specifies O2 conversion (combustion)
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };

  // 1. Add Air Components
  Object.entries(airMolesToAdd).forEach(([comp, val]) => {
    outlet[comp as ComponentKey] += val;
  });

  // 2. O2 Combustion: H2 + 0.5O2 -> H2O
  // Calculation based on O2 conversion as requested
  const totalO2InStream = outlet.O2;
  const targetO2ToReact = totalO2InStream * o2Conversion;
  
  // Stoichiometry: 1 mol O2 needs 2 mol H2
  const h2Required = 2 * targetO2ToReact;
  const h2Available = outlet.H2;
  
  // Safety check: Cannot react more H2 than available
  const actualH2Reacted = Math.min(h2Available, h2Required);
  const actualO2Reacted = actualH2Reacted / 2;
  
  outlet.H2 -= actualH2Reacted;
  outlet.H2O += actualH2Reacted;
  outlet.O2 -= actualO2Reacted;

  // 3. Remaining CH4 Reforming: CH4 + H2O -> CO + 3H2
  const ch4Remaining = outlet.CH4;
  const reacted = ch4Remaining * ch4Conversion;
  outlet.CH4 -= reacted;
  outlet.H2O -= reacted;
  outlet.CO += reacted;
  outlet.H2 += 3 * reacted;

  // 4. Water Gas Shift: CO + H2O -> CO2 + H2
  const shiftAmount = outlet.CO * coConversion;
  outlet.CO -= shiftAmount;
  outlet.H2O -= shiftAmount;
  outlet.CO2 += shiftAmount;
  outlet.H2 += shiftAmount;

  return outlet;
};

export const calculateShiftConverter = (
  inletMoles: Record<ComponentKey, number>,
  coConversion: number
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };
  
  // Shift: CO + H2O -> CO2 + H2
  const molesCOConverted = inletMoles.CO * coConversion;
  outlet.CO -= molesCOConverted;
  outlet.H2O -= molesCOConverted;
  outlet.CO2 += molesCOConverted;
  outlet.H2 += molesCOConverted;

  return outlet;
};

export const calculateMethanator = (
  inletMoles: Record<ComponentKey, number>,
  coConversion: number,
  co2Conversion: number
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };
  
  // CO Methanation: CO + 3H2 -> CH4 + H2O
  const coReacted = inletMoles.CO * coConversion;
  outlet.CO -= coReacted;
  outlet.H2 -= 3 * coReacted;
  outlet.CH4 += coReacted;
  outlet.H2O += coReacted;

  // CO2 Methanation: CO2 + 4H2 -> CH4 + 2H2O
  const co2Reacted = inletMoles.CO2 * co2Conversion;
  outlet.CO2 -= co2Reacted;
  outlet.H2 -= 4 * co2Reacted;
  outlet.CH4 += co2Reacted;
  outlet.H2O += 2 * co2Reacted;

  return outlet;
};

export const calculateAmmoniaReactor = (
  inletMoles: Record<ComponentKey, number>,
  n2Conversion: number // Conversion of Nitrogen
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };
  
  // N2 + 3H2 = 2NH3
  const n2Reacted = inletMoles.N2 * n2Conversion;
  const h2Reacted = 3 * n2Reacted;
  const nh3Produced = 2 * n2Reacted;

  outlet.N2 -= n2Reacted;
  outlet.H2 -= h2Reacted;
  outlet.NH3 += nh3Produced;

  return outlet;
};

export const calculateCondensate = (
  inletMoles: Record<ComponentKey, number>,
  h2oRemovalEfficiency: number
): Record<ComponentKey, number> => {
  const outlet = { ...inletMoles };
  outlet.H2O = inletMoles.H2O * (1 - h2oRemovalEfficiency);
  return outlet;
};

export const calculateAbsorber = (
  inletMoles: Record<ComponentKey, number>,
  targetDryCO2Percent: number // Target mole % of CO2 in top product (dry basis)
): { top: Record<ComponentKey, number>; bottom: Record<ComponentKey, number> } => {
  const top = { ...inletMoles };
  const bottom: Record<ComponentKey, number> = {
    AR: 0, C2H6: 0, CH4: 0, CO: 0, CO2: 0, H2: 0, N2: 0, NH3: 0, O2: 0, H2O: 0
  };

  const nonCO2DryMoles = COMPONENTS
    .filter(c => c !== 'CO2' && c !== 'H2O')
    .reduce((acc, comp) => acc + inletMoles[comp], 0);

  const targetFraction = targetDryCO2Percent / 100;
  const co2Remaining = targetFraction >= 1 
    ? inletMoles.CO2 
    : (targetFraction * nonCO2DryMoles) / (1 - targetFraction);

  const co2Absorbed = Math.max(0, inletMoles.CO2 - co2Remaining);

  top.CO2 = Math.min(inletMoles.CO2, co2Remaining);
  bottom.CO2 = co2Absorbed;
  
  return { top, bottom };
};

export const calculateStripper = (
  absorbedMoles: Record<ComponentKey, number>,
  targetPurityDry: number // Target CO2 mole % in product
): Record<ComponentKey, number> => {
  const outlet = { ...absorbedMoles };
  return outlet;
};
