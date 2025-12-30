
import React from 'react';
import { ComponentKey, StreamData } from '../types';
import { COMPONENTS, CONVERSION_FACTOR } from '../constants';

interface StreamTableProps {
  title: string;
  data: StreamData;
  isEditable?: boolean;
  onEdit?: (comp: ComponentKey, value: number) => void;
  onTotalEdit?: (newTotalKgmol: number) => void;
  componentsToShow?: ComponentKey[];
  readOnlyFlows?: boolean;
}

const StreamTable: React.FC<StreamTableProps> = ({ 
  title, 
  data, 
  isEditable, 
  onEdit, 
  componentsToShow,
  readOnlyFlows,
}) => {
  const visibleComponents = componentsToShow || COMPONENTS;

  // The denominator is strictly the current total sum of the stream
  const currentTotalMoles = data.totalMoles;
  const h2oMoles = data.moles.H2O || 0;
  const currentDryBasis = currentTotalMoles - h2oMoles;

  const handleKgmolChange = (comp: ComponentKey, valStr: string) => {
    // Strips leading zeros by converting to number
    const val = parseFloat(valStr);
    onEdit?.(comp, isNaN(val) ? 0 : val);
  };

  const handleNmcChange = (comp: ComponentKey, valStr: string) => {
    const val = parseFloat(valStr);
    const moles = (isNaN(val) ? 0 : val) / CONVERSION_FACTOR;
    onEdit?.(comp, moles);
  };

  const handleMolePercentChange = (comp: ComponentKey, valStr: string) => {
    const targetPercent = parseFloat(valStr);
    const targetFraction = (isNaN(targetPercent) ? 0 : targetPercent) / 100;
    
    // When editing by %, we use the current total sum as the reference
    const newMoles = targetFraction * currentTotalMoles;
    onEdit?.(comp, newMoles);
  };

  const handleDryMolePercentChange = (comp: ComponentKey, valStr: string) => {
    if (comp === 'H2O') return; // Dry basis editing not applicable to H2O
    const targetPercent = parseFloat(valStr);
    const targetFraction = (isNaN(targetPercent) ? 0 : targetPercent) / 100;
    
    // Calculate absolute flow based on current dry basis
    const newMoles = targetFraction * currentDryBasis;
    onEdit?.(comp, newMoles);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const visibleTotalMoles = visibleComponents.reduce((acc, c) => acc + (data.moles[c] || 0), 0);
  const visibleTotalVolume = visibleTotalMoles * CONVERSION_FACTOR;
  
  const totalWetMolePercent = currentTotalMoles > 0 ? (visibleTotalMoles / currentTotalMoles) * 100 : 0;
  
  const visibleDryTotalMoles = visibleComponents
    .filter(c => c !== 'H2O')
    .reduce((acc, c) => acc + (data.moles[c] || 0), 0);
  
  const totalDryMolePercent = currentDryBasis > 0 ? (visibleDryTotalMoles / currentDryBasis) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-800 text-white px-4 py-3 font-semibold flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="flex flex-col">
            <span className="text-sm">{title}</span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
           <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">1 hr Basis</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-100 text-gray-700 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-3 border-b">Component</th>
              <th className="px-3 py-3 text-right border-b">Kgmol/hr</th>
              <th className="px-3 py-3 text-right border-b bg-blue-50/50 text-blue-700">NMC/hr</th>
              <th className="px-3 py-3 text-right border-b bg-emerald-50/50 text-emerald-700">Wet mol%</th>
              <th className="px-3 py-3 text-right border-b bg-indigo-50/50 text-indigo-700">Dry mol%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {visibleComponents.map((comp) => {
              const moles = data.moles[comp] || 0;
              const volume = moles * CONVERSION_FACTOR;
              const wetMolePercent = currentTotalMoles > 0 ? (moles / currentTotalMoles) * 100 : 0;
              const dryMolePercent = (comp === 'H2O' || currentDryBasis <= 0) ? 0 : (moles / currentDryBasis) * 100;

              return (
                <tr key={comp} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700 border-r">{comp}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {isEditable && !readOnlyFlows ? (
                      <input
                        type="number"
                        step="any"
                        value={moles === 0 ? "0" : Number(moles.toFixed(8))}
                        onFocus={handleFocus}
                        onChange={(e) => handleKgmolChange(comp, e.target.value)}
                        className="w-full text-right border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    ) : (
                      moles.toFixed(4)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right bg-blue-50/20 font-mono">
                    {isEditable && !readOnlyFlows ? (
                      <input
                        type="number"
                        step="any"
                        value={volume === 0 ? "0" : Number(volume.toFixed(4))}
                        onFocus={handleFocus}
                        onChange={(e) => handleNmcChange(comp, e.target.value)}
                        className="w-full text-right border border-blue-100 rounded px-2 py-1 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
                      />
                    ) : (
                      volume.toFixed(2)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right bg-emerald-50/20">
                    {isEditable ? (
                      <input
                        type="number"
                        step="any"
                        value={wetMolePercent === 0 ? "0" : Number(wetMolePercent.toFixed(6))}
                        onFocus={handleFocus}
                        onChange={(e) => handleMolePercentChange(comp, e.target.value)}
                        className="w-full text-right border border-emerald-100 rounded px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-xs"
                      />
                    ) : (
                      <span className="font-mono text-xs">{wetMolePercent.toFixed(4)}%</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right bg-indigo-50/20 text-indigo-700 font-mono text-xs">
                    {isEditable && comp !== 'H2O' ? (
                      <input
                        type="number"
                        step="any"
                        value={dryMolePercent === 0 ? "0" : Number(dryMolePercent.toFixed(6))}
                        onFocus={handleFocus}
                        onChange={(e) => handleDryMolePercentChange(comp, e.target.value)}
                        className="w-full text-right border border-indigo-100 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-xs"
                      />
                    ) : (
                      <span className="font-mono text-xs">{dryMolePercent.toFixed(4)}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
            <tr className="text-gray-900 bg-gray-50/80">
              <td className="px-3 py-4 uppercase text-[10px] tracking-widest flex items-center">
                <i className="fas fa-sigma mr-2 text-gray-400"></i> Total Sum
              </td>
              <td className="px-3 py-4 text-right border-t-2 border-gray-300">
                <span className="font-mono text-base">{visibleTotalMoles.toFixed(4)}</span>
                <p className="text-[9px] text-gray-400 font-normal uppercase tracking-tighter">Kgmol/hr</p>
              </td>
              <td className="px-3 py-4 text-right text-blue-700 border-t-2 border-gray-300">
                <span className="font-mono text-base">{visibleTotalVolume.toFixed(2)}</span>
                <p className="text-[9px] text-blue-400 font-normal uppercase tracking-tighter">NMC/hr</p>
              </td>
              <td className="px-3 py-4 text-right font-mono text-base border-t-2 border-gray-300 text-emerald-700">
                {totalWetMolePercent.toFixed(4)}%
              </td>
              <td className="px-3 py-4 text-right font-mono text-base text-indigo-700 border-t-2 border-gray-300">
                {totalDryMolePercent.toFixed(4)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {isEditable && (
        <div className="p-2 text-[9px] italic text-center border-t bg-gray-50 text-gray-400 border-gray-100">
          Totals are auto-summed from components. Wet % = Moles / Total Sum. Dry % = Moles / (Total Sum - H2O).
        </div>
      )}
    </div>
  );
};

export default StreamTable;
