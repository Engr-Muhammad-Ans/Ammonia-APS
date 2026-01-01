
import React, { useState, useMemo } from 'react';
import { 
  calculateStreamDerivedData, 
  calculatePrimaryReformer, 
  calculateSecondaryReformer, 
  calculateShiftConverter,
  calculateMethanator,
  calculateAmmoniaReactor
} from './services/balanceService';
import { ComponentKey, StreamData } from './types';
import { INITIAL_MOLES, COMPONENTS, CONVERSION_FACTOR } from './constants';
import StreamTable from './components/StreamTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [inletFeed, setInletFeed] = useState<Record<ComponentKey, number>>(INITIAL_MOLES);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  
  // Plant Feed Rates
  const [processGasFlow, setProcessGasFlow] = useState<number>(100000);
  const [recycleGasFlow, setRecycleGasFlow] = useState<number>(5000);
  const [steamFlow, setSteamFlow] = useState<number>(250);

  // Design Parameters for Front End Load
  const [designProcessGasFlow, setDesignProcessGasFlow] = useState<number>(110000);
  const [designCarbonNumber, setDesignCarbonNumber] = useState<number>(1.05);

  // Operational Parameters (Temperature and Pressure)
  const [opParams, setOpParams] = useState({
    primary: { tin: 520, tout: 810, pin: 35.0, pout: 32.5 },
    secondary: { tin: 810, tout: 980, pin: 32.0, pout: 31.0 },
    hts: { tin: 360, tout: 420, pin: 30.5, pout: 29.8 },
    lts: { tin: 200, tout: 225, pin: 29.5, pout: 28.5 },
    methanator: { tin: 280, tout: 320, pin: 27.5, pout: 26.8 },
    ammoniaReactor: { tin: 380, tout: 450, pin: 150.0, pout: 145.0 },
  });

  // State for Air Feed
  const [airMoles, setAirMoles] = useState<Record<ComponentKey, number>>(() => {
    const totalNmc = 15000;
    const totalMoles = totalNmc / CONVERSION_FACTOR;
    return {
      AR: totalMoles * 0.0097,
      C2H6: 0,
      CH4: 0,
      CO: 0,
      CO2: totalMoles * 0.0003,
      H2: 0,
      N2: totalMoles * 0.7808,
      NH3: 0,
      O2: totalMoles * 0.2092,
      H2O: 0
    };
  });

  const [params, setParams] = useState({
    primaryCh4Conv: 0.85,
    primaryC2h6Conv: 1.0,
    primaryCoConv: 0.5,
    secondaryCh4Conv: 0.95,
    secondaryCoConv: 0.3,
    secondaryO2Conv: 1.0, // Defaulting to 100% O2 conversion for combustion
    htsCoConv: 0.90,
    ltsCoConv: 0.95,
    methanatorCoConv: 0.9999,
    methanatorCo2Conv: 0.9999,
    reactorConv: 0.15, // Single pass conversion
  });

  const [activeTab, setActiveTab] = useState<'inputs' | 'primary' | 'secondary' | 'hts' | 'lts' | 'methanator' | 'ammoniaReactor' | 'charts'>('inputs');

  const [methanatorInletMoles, setMethanatorInletMoles] = useState<Record<ComponentKey, number> | null>(null);
  const [ammoniaReactorInletMoles, setAmmoniaReactorInletMoles] = useState<Record<ComponentKey, number> | null>(null);

  const plantData = useMemo(() => {
    const primaryInlet = calculateStreamDerivedData(inletFeed);
    const primaryOutletMoles = calculatePrimaryReformer(
      inletFeed, 
      params.primaryCh4Conv, 
      params.primaryC2h6Conv,
      params.primaryCoConv
    );
    const primaryOutlet = calculateStreamDerivedData(primaryOutletMoles);

    const secondaryInlet = primaryOutlet;
    const airFeedMoles = { ...airMoles };
    const secondaryOutletMoles = calculateSecondaryReformer(
      secondaryInlet.moles,
      airFeedMoles,
      params.secondaryCh4Conv,
      params.secondaryCoConv,
      params.secondaryO2Conv
    );
    const secondaryOutlet = calculateStreamDerivedData(secondaryOutletMoles);

    const htsInlet = secondaryOutlet;
    const htsOutletMoles = calculateShiftConverter(
      htsInlet.moles,
      params.htsCoConv
    );
    const htsOutlet = calculateStreamDerivedData(htsOutletMoles);

    const ltsInlet = htsOutlet;
    const ltsOutletMoles = calculateShiftConverter(
      ltsInlet.moles,
      params.ltsCoConv
    );
    const ltsOutlet = calculateStreamDerivedData(ltsOutletMoles);

    const methanatorInletMolesActual = methanatorInletMoles || ltsOutletMoles;
    const methanatorInlet = calculateStreamDerivedData(methanatorInletMolesActual);
    const methanatorOutletMoles = calculateMethanator(
      methanatorInletMolesActual,
      params.methanatorCoConv,
      params.methanatorCo2Conv
    );
    const methanatorOutlet = calculateStreamDerivedData(methanatorOutletMoles);

    const ammoniaReactorInletMolesActual = ammoniaReactorInletMoles || methanatorOutletMoles;
    const ammoniaReactorInlet = calculateStreamDerivedData(ammoniaReactorInletMolesActual);
    const ammoniaReactorOutletMoles = calculateAmmoniaReactor(
      ammoniaReactorInletMolesActual,
      params.reactorConv
    );
    const ammoniaReactorOutlet = calculateStreamDerivedData(ammoniaReactorOutletMoles);

    return {
      primary: { inlet: primaryInlet, outlet: primaryOutlet },
      secondary: { inlet: secondaryInlet, outlet: secondaryOutlet },
      hts: { inlet: htsInlet, outlet: htsOutlet },
      lts: { inlet: ltsInlet, outlet: ltsOutlet },
      methanator: { inlet: methanatorInlet, outlet: methanatorOutlet },
      ammoniaReactor: { inlet: ammoniaReactorInlet, outlet: ammoniaReactorOutlet },
      air: calculateStreamDerivedData(airMoles)
    };
  }, [inletFeed, airMoles, params, methanatorInletMoles, ammoniaReactorInletMoles]);

  const hnRatio = useMemo(() => {
    const inlet = plantData.ammoniaReactor.inlet.moles;
    if (!inlet.N2 || inlet.N2 === 0) return 0;
    return inlet.H2 / inlet.N2;
  }, [plantData.ammoniaReactor.inlet]);

  const carbonNumber = useMemo(() => {
    const inlet = plantData.primary.inlet;
    const totalMoles = inlet.totalMoles;
    const h2oMoles = inlet.moles.H2O || 0;
    const dryTotal = totalMoles - h2oMoles;
    if (dryTotal <= 0) return 0;
    return (1 * (inlet.moles.CH4 || 0) + 2 * (inlet.moles.C2H6 || 0) + 1 * (inlet.moles.CO2 || 0) + 1 * (inlet.moles.CO || 0)) / dryTotal;
  }, [plantData.primary.inlet]);

  const steamToCarbonRatio = useMemo(() => {
    if (carbonNumber <= 0 || processGasFlow <= 0) return 0;
    return (steamFlow * 1245.2222222) / (carbonNumber * processGasFlow);
  }, [steamFlow, carbonNumber, processGasFlow]);

  const frontEndLoad = useMemo(() => {
    const designLoad = designProcessGasFlow * designCarbonNumber;
    if (designLoad <= 0) return 0;
    return (processGasFlow * carbonNumber) / designLoad;
  }, [processGasFlow, carbonNumber, designProcessGasFlow, designCarbonNumber]);

  const handleInletEdit = (comp: ComponentKey, value: number) => {
    setInletFeed(prev => ({ ...prev, [comp]: value }));
  };

  const handleAirEdit = (comp: ComponentKey, value: number) => {
    setAirMoles(prev => ({ ...prev, [comp]: value }));
  };

  const handleMethanatorInletEdit = (comp: ComponentKey, value: number) => {
    setMethanatorInletMoles(prev => {
      const base = prev || plantData.lts.outlet.moles;
      return { ...base, [comp]: value };
    });
  };

  const handleAmmoniaReactorInletEdit = (comp: ComponentKey, value: number) => {
    setAmmoniaReactorInletMoles(prev => {
      const base = prev || plantData.methanator.outlet.moles;
      return { ...base, [comp]: value };
    });
  };

  const updateOpParams = (unit: keyof typeof opParams, key: keyof typeof opParams.primary, val: string) => {
    setOpParams(prev => ({
      ...prev,
      [unit]: {
        ...prev[unit],
        [key]: parseFloat(val) || 0
      }
    }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const chartData = useMemo(() => {
    return COMPONENTS.filter(c => !['NH3', 'O2'].includes(c) || c === 'NH3').map(comp => ({
      name: comp,
      'Feed': plantData.primary.inlet.moleFractions[comp] * 100,
      'P. Ref': plantData.primary.outlet.moleFractions[comp] * 100,
      'S. Ref': plantData.secondary.outlet.moleFractions[comp] * 100,
      'HTS': plantData.hts.outlet.moleFractions[comp] * 100,
      'LTS': plantData.lts.outlet.moleFractions[comp] * 100,
      'Meth': plantData.methanator.outlet.moleFractions[comp] * 100,
      'React': plantData.ammoniaReactor.outlet.moleFractions[comp] * 100,
    }));
  }, [plantData]);

  const handleDownloadPDF = () => {
    const doc = new jsPDF() as any;
    const tabName = activeTab === 'inputs' ? 'Feed & Config' : 
                   activeTab === 'primary' ? 'Primary Reformer' : 
                   activeTab === 'secondary' ? 'Secondary Reformer' : 
                   activeTab === 'hts' ? 'HTS Shift' : 
                   activeTab === 'lts' ? 'LTS Shift' : 
                   activeTab === 'methanator' ? 'Methanator' : 
                   activeTab === 'ammoniaReactor' ? 'Ammonia Reactor' : 'Simulation Trends';
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); 
    doc.text('Ammonia Plant', 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); 
    doc.text('Process Simulator (APS)', 105, 22, { align: 'center' });
    doc.setFontSize(14);
    doc.setTextColor(37, 99, 235); 
    doc.text(tabName, 105, 32, { align: 'center' });

    let yPos = 45;
    const addTable = (title: string, data: StreamData, comps: ComponentKey[] = COMPONENTS) => {
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(title, 14, yPos);
      yPos += 5;
      const dryTotal = data.totalMoles - (data.moles.H2O || 0);
      const rows = comps.map(c => [
        c,
        data.moles[c].toFixed(4),
        (data.moles[c] * CONVERSION_FACTOR).toFixed(2),
        ((data.moles[c] / data.totalMoles) * 100).toFixed(4) + '%',
        c === 'H2O' ? '-' : ((data.moles[c] / dryTotal) * 100).toFixed(4) + '%'
      ]);
      doc.autoTable({
        startY: yPos,
        head: [['Component', 'Kgmol/hr', 'NMC/hr', 'Wet mol%', 'Dry mol%']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [31, 41, 55] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 }
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;
    };

    if (activeTab === 'inputs') {
      const kpis = [
        ['KPI Parameter', 'Value'],
        ['Process Gas Flow', `${processGasFlow} NMC/hr`],
        ['Recycle Gas Flow', `${recycleGasFlow} NMC/hr`],
        ['Steam Flow', `${steamFlow} Tons/hr`],
        ['Feed Gas Carbon No.', carbonNumber.toFixed(4)],
        ['S/C Ratio', steamToCarbonRatio.toFixed(4)],
        ['Front End Load', (frontEndLoad * 100).toFixed(2) + '%']
      ];
      doc.autoTable({ startY: yPos, head: kpis.slice(0,1), body: kpis.slice(1), theme: 'grid' });
      yPos = (doc as any).lastAutoTable.finalY + 10;
      addTable('Inlet Feed Specification', plantData.primary.inlet);
      addTable('Air Feed Specification', plantData.air, ['N2', 'O2', 'AR', 'CO2', 'H2O']);
    } else {
      const unit = activeTab as keyof typeof opParams;
      const op = opParams[unit];
      const opTable = [['Parameter', 'Value'], ['Inlet Temp', `${op.tin} °C`], ['Outlet Temp', `${op.tout} °C`], ['Inlet Pressure', `${op.pin} kg/cm²g`], ['Outlet Pressure', `${op.pout} kg/cm²g`]];
      doc.autoTable({ startY: yPos, head: opTable.slice(0,1), body: opTable.slice(1), theme: 'grid' });
      yPos = (doc as any).lastAutoTable.finalY + 10;
      const unitData = plantData[unit as keyof typeof plantData] as any;
      addTable('Inlet Stream', unitData.inlet);
      addTable('Outlet Stream', unitData.outlet);
    }
    doc.save(`Ammonia_Plant_${tabName.replace(/\s/g, '_')}_${new Date().getTime()}.pdf`);
  };

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const tabName = activeTab === 'inputs' ? 'Feed & Config' : 
                   activeTab === 'primary' ? 'Primary Reformer' : 
                   activeTab === 'secondary' ? 'Secondary Reformer' : 
                   activeTab === 'hts' ? 'HTS Shift' : 
                   activeTab === 'lts' ? 'LTS Shift' : 
                   activeTab === 'methanator' ? 'Methanator' : 
                   activeTab === 'ammoniaReactor' ? 'Ammonia Reactor' : 'Simulation Trends';
    
    let content: any[][] = [['Ammonia Plant'], ['Process Simulator (APS)'], [`Tab: ${tabName}`], []];
    const streamToRows = (title: string, data: StreamData, comps: ComponentKey[] = COMPONENTS) => {
      const dryTotal = data.totalMoles - (data.moles.H2O || 0);
      return [[title], ['Component', 'Kgmol/hr', 'NMC/hr', 'Wet mol%', 'Dry mol%'], ...comps.map(c => [c, data.moles[c], data.moles[c] * CONVERSION_FACTOR, (data.moles[c] / data.totalMoles) * 100, c === 'H2O' ? 0 : (data.moles[c] / dryTotal) * 100]), ['Total Sum', data.totalMoles, data.totalVolume, 100, 100], []];
    };

    if (activeTab !== 'inputs' && activeTab !== 'charts') {
      const unit = activeTab as keyof typeof opParams;
      const op = opParams[unit];
      content.push(['Equipment Parameters'], ['Parameter', 'Value', 'Unit'], ['Inlet Temp', op.tin, '°C'], ['Outlet Temp', op.tout, '°C'], ['Inlet Pressure', op.pin, 'kg/cm2.g'], ['Outlet Pressure', op.pout, 'kg/cm2.g'], [], ...streamToRows('Inlet Stream', (plantData[unit as keyof typeof plantData] as any).inlet), ...streamToRows('Outlet Stream', (plantData[unit as keyof typeof plantData] as any).outlet));
    }

    const ws = XLSX.utils.aoa_to_sheet(content);
    XLSX.utils.book_append_sheet(wb, ws, tabName.substring(0, 31));
    XLSX.writeFile(wb, `Ammonia_Plant_${tabName.replace(/\s/g, '_')}_${new Date().getTime()}.xlsx`);
  };

  const renderOpControlRow = (unit: keyof typeof opParams) => {
    const data = opParams[unit];
    const deltaT = data.tout - data.tin;
    const deltaP = data.pout - data.pin;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-6 border-t border-gray-100">
        <div className="bg-slate-50 p-3 rounded border border-slate-100 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inlet Temp (°C)</label><input type="number" step="any" onFocus={handleFocus} value={data.tin === 0 ? "0" : data.tin} onChange={e => updateOpParams(unit, 'tin', e.target.value)} className="w-full border border-slate-200 rounded p-1 font-mono text-sm text-slate-800 outline-none focus:ring-1 focus:ring-blue-400"/></div>
        <div className="bg-slate-50 p-3 rounded border border-slate-100 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Outlet Temp (°C)</label><input type="number" step="any" onFocus={handleFocus} value={data.tout === 0 ? "0" : data.tout} onChange={e => updateOpParams(unit, 'tout', e.target.value)} className="w-full border border-slate-200 rounded p-1 font-mono text-sm text-slate-800 outline-none focus:ring-1 focus:ring-blue-400"/></div>
        <div className="bg-slate-50 p-3 rounded border border-slate-100 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inlet Pres (kg/cm²g)</label><input type="number" step="any" onFocus={handleFocus} value={data.pin === 0 ? "0" : data.pin} onChange={e => updateOpParams(unit, 'pin', e.target.value)} className="w-full border border-slate-200 rounded p-1 font-mono text-sm text-slate-800 outline-none focus:ring-1 focus:ring-blue-400"/></div>
        <div className="bg-slate-50 p-3 rounded border border-slate-100 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Outlet Pres (kg/cm²g)</label><input type="number" step="any" onFocus={handleFocus} value={data.pout === 0 ? "0" : data.pout} onChange={e => updateOpParams(unit, 'pout', e.target.value)} className="w-full border border-slate-200 rounded p-1 font-mono text-sm text-slate-800 outline-none focus:ring-1 focus:ring-blue-400"/></div>
        <div className="bg-emerald-50 p-3 rounded border border-emerald-200 shadow-sm"><label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">ΔT (°C)</label><div className="w-full bg-white border border-emerald-100 rounded p-1 font-mono text-sm font-bold text-emerald-700 text-center">{deltaT.toFixed(2)}</div></div>
        <div className="bg-orange-50 p-3 rounded border border-orange-200 shadow-sm"><label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">ΔP (kg/cm²)</label><div className="w-full bg-white border border-orange-100 rounded p-1 font-mono text-sm font-bold text-orange-700 text-center">{deltaP.toFixed(3)}</div></div>
      </div>
    );
  };

  const renderDownloadButtons = () => (
    <div className="flex flex-wrap gap-4 mt-12 pt-8 border-t border-gray-200 justify-center">
      <button onClick={handleDownloadPDF} className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-all active:scale-95"><i className="fas fa-file-pdf"></i><span>Download in PDF</span></button>
      <button onClick={handleDownloadExcel} className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-all active:scale-95"><i className="fas fa-file-excel"></i><span>Download in Excel</span></button>
    </div>
  );

  if (showLanding) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 font-sans text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        <div className="max-w-4xl px-8 text-center relative z-10 animate-fadeInUp flex flex-col items-center">
          <div className="mb-8 inline-flex items-center justify-center w-24 h-24 bg-emerald-500/10 rounded-3xl border border-emerald-500/20 shadow-2xl backdrop-blur-md">
            <i className="fas fa-industry text-5xl text-emerald-400"></i>
          </div>
          <div className="space-y-2 mb-12">
            <h1 className="text-6xl md:text-8xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-emerald-200">
              Ammonia
            </h1>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-emerald-400/90">
              Process Simulator (APS)
            </h2>
          </div>
          <button 
            onClick={() => setShowLanding(false)}
            className="group relative inline-flex items-center justify-center px-12 py-5 font-bold text-white transition-all duration-300 bg-emerald-600 rounded-2xl hover:bg-emerald-500 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)] active:scale-95 border border-emerald-400/20"
          >
            <span className="text-2xl">Let’s Begin</span>
          </button>
        </div>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fadeInUp {
            animation: fadeInUp 1s cubic-bezier(0.16, 1, 0.3, 1);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen font-sans antialiased bg-gray-50">
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <i className="fas fa-industry text-2xl text-emerald-400"></i>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ammonia Plant</h1>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Process Simulator (APS)</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAboutOpen(true)}
            aria-label="About Ammonia-APS"
            className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white w-10 h-10 sm:w-auto sm:px-4 sm:h-10 rounded-full sm:rounded-lg transition-all border border-slate-700 shadow-sm"
          >
            <i className="fas fa-info-circle text-emerald-400 text-lg"></i>
            <span className="hidden sm:inline ml-2 text-sm font-bold uppercase tracking-wide">About</span>
          </button>
        </div>
      </header>

      {/* About Modal */}
      {isAboutOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsAboutOpen(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-800 p-4 text-white flex justify-between items-center flex-shrink-0">
              <div className="flex items-center space-x-3">
                <i className="fas fa-info-circle text-emerald-400"></i>
                <h2 className="text-lg font-bold">About Ammonia-APS</h2>
              </div>
              <button 
                onClick={() => setIsAboutOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-600 leading-relaxed text-sm md:text-base border-b border-slate-100 bg-white">
              <div className="space-y-4">
                <p className="font-semibold text-slate-900 border-l-4 border-emerald-500 pl-4 bg-slate-50 py-2 rounded">
                  Ammonia Process Simulator (APS) is an interactive engineering tool designed to perform detailed material balance calculations across an entire ammonia plant.
                </p>
                <p>
                  The simulator allows users to define feed compositions, operating conditions, and conversion parameters, and instantly visualize their impact across major process units including reformers, shift converters, methanator, and ammonia reactor. Both wet and dry mole fractions, mass and volumetric flows, and key performance indicators such as Carbon Number, Steam-to-Carbon ratio, Front End Load, ΔT, ΔP, and H/N ratio are calculated dynamically.
                </p>
                <p>
                  Built with a strong focus on process fundamentals, transparency of calculations, and engineering accuracy, this app serves as a powerful learning, analysis, and what-if simulation platform for operation and practicing process engineers working in ammonia and syngas plants.
                </p>
              </div>
            </div>

            <div className="flex-shrink-0 bg-slate-50 p-6 space-y-4 border-t border-slate-100">
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-2">Developed By</span>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900">Muhammad Ans</h3>
                  <div className="flex items-center justify-center mt-0.5 space-x-2">
                    <span className="h-px w-3 bg-emerald-400"></span>
                    <span className="text-emerald-600 font-bold text-xs tracking-wide uppercase">Process & Control Engineer</span>
                    <span className="h-px w-3 bg-emerald-400"></span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="bg-slate-800 text-white px-10 py-2.5 rounded-lg font-bold hover:bg-slate-700 transition-all shadow-md active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
        <div className="flex flex-wrap border-b border-gray-200 mb-6 gap-1 bg-white p-1 rounded-t-lg shadow-sm">
          {[
            { id: 'inputs', label: 'Feed & Config', icon: 'fa-vials' },
            { id: 'primary', label: 'Primary Reformer', icon: 'fa-fire-alt' },
            { id: 'secondary', label: 'Secondary Reformer', icon: 'fa-wind' },
            { id: 'hts', label: 'HTS Shift', icon: 'fa-angle-double-up' },
            { id: 'lts', label: 'LTS Shift', icon: 'fa-angle-double-down' },
            { id: 'methanator', label: 'Methanator', icon: 'fa-flask-vial' },
            { id: 'ammoniaReactor', label: 'Ammonia Reactor', icon: 'fa-vial-circle-check' },
            { id: 'charts', label: 'Simulation Trends', icon: 'fa-chart-line' },
            { id: 'external-insights', label: 'Ammonia Insights', icon: 'fa-external-link-alt', isExternal: true }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if ((tab as any).isExternal) {
                  window.open('https://ammonia-insights.vercel.app/', '_blank');
                } else {
                  setActiveTab(tab.id as any);
                }
              }}
              className={`flex items-center space-x-2 px-6 py-3 text-sm font-semibold transition-all rounded-md ${
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-md transform scale-105' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <i className={`fas ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="animate-fadeIn">
          {activeTab === 'inputs' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-slate-700">
                    <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6">
                      <div className="bg-slate-100 p-2 rounded-full"><i className="fas fa-gas-pump text-slate-600"></i></div>
                      <h3 className="text-lg font-bold text-gray-800">Current Feed Rates</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Process Gas Flow</label>
                        <div className="relative mt-2">
                          <input type="number" step="any" onFocus={handleFocus} value={processGasFlow === 0 ? "0" : processGasFlow} onChange={e => setProcessGasFlow(parseFloat(e.target.value) || 0)} className="w-full border border-slate-200 rounded-md p-2 pr-16 font-mono text-lg text-slate-800 focus:ring-2 focus:ring-slate-500 outline-none bg-white shadow-inner"/>
                          <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">NMC/hr</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recycle Gas Flow</label>
                        <div className="relative mt-2">
                          <input type="number" step="any" onFocus={handleFocus} value={recycleGasFlow === 0 ? "0" : recycleGasFlow} onChange={e => setRecycleGasFlow(parseFloat(e.target.value) || 0)} className="w-full border border-slate-200 rounded-md p-2 pr-16 font-mono text-lg text-slate-800 focus:ring-2 focus:ring-slate-500 outline-none bg-white shadow-inner"/>
                          <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">NMC/hr</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Steam Flow Rate</label>
                        <div className="relative mt-2">
                          <input type="number" step="any" onFocus={handleFocus} value={steamFlow === 0 ? "0" : steamFlow} onChange={e => setSteamFlow(parseFloat(e.target.value) || 0)} className="w-full border border-slate-200 rounded-md p-2 pr-16 font-mono text-lg text-slate-800 focus:ring-2 focus:ring-slate-500 outline-none bg-white shadow-inner"/>
                          <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">Tons/hr</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg border border-indigo-200 shadow-sm border-l-4 border-l-indigo-700">
                    <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6">
                      <div className="bg-indigo-100 p-2 rounded-full"><i className="fas fa-drafting-compass text-indigo-600"></i></div>
                      <h3 className="text-lg font-bold text-gray-800">Plant Design Basis</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Design Process Gas Flow</label>
                        <div className="relative mt-2">
                          <input type="number" step="any" onFocus={handleFocus} value={designProcessGasFlow === 0 ? "0" : designProcessGasFlow} onChange={e => setDesignProcessGasFlow(parseFloat(e.target.value) || 0)} className="w-full border border-indigo-200 rounded-md p-2 pr-16 font-mono text-lg text-indigo-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-inner"/>
                          <span className="absolute right-3 top-2.5 text-[10px] font-bold text-indigo-400">NMC/hr</span>
                        </div>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Design Carbon No.</label>
                        <div className="relative mt-2">
                          <input type="number" step="any" onFocus={handleFocus} value={designCarbonNumber === 0 ? "0" : designCarbonNumber} onChange={e => setDesignCarbonNumber(parseFloat(e.target.value) || 0)} className="w-full border border-indigo-200 rounded-md p-2 font-mono text-lg text-indigo-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-inner"/>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <StreamTable title="Inlet Feed Specification" data={plantData.primary.inlet} isEditable onEdit={handleInletEdit} />
                <StreamTable title="Air Feed Specification (Secondary Reformer)" data={plantData.air} isEditable onEdit={handleAirEdit} componentsToShow={['N2', 'O2', 'AR', 'CO2', 'H2O']} />
                {renderDownloadButtons()}
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 text-white px-5 py-4">
                    <div className="flex items-center space-x-2"><i className="fas fa-chart-line text-emerald-400"></i><h3 className="font-bold text-sm uppercase tracking-wider">Operational KPI Summary</h3></div>
                  </div>
                  <div className="p-0 divide-y divide-slate-100">
                    <div className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-atom text-xs"></i></div><span className="text-xs font-semibold text-slate-500 uppercase tracking-tight">Feed Gas Carbon No.</span></div>
                      <span className="text-2xl font-bold font-mono text-blue-700">{carbonNumber.toFixed(4)}</span>
                    </div>
                    <div className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-full bg-fuchsia-100 flex items-center justify-center text-fuchsia-600"><i className="fas fa-flask text-xs"></i></div><span className="text-xs font-semibold text-slate-500 uppercase tracking-tight">S/C Ratio</span></div>
                      <span className="text-2xl font-bold font-mono text-fuchsia-700">{steamToCarbonRatio.toFixed(4)}</span>
                    </div>
                    <div className="px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><i className="fas fa-tachometer-alt text-xs"></i></div><span className="text-xs font-semibold text-slate-500 uppercase tracking-tight">Front End Load</span></div>
                      <div className="text-right"><span className="text-2xl font-bold font-mono text-amber-700">{(frontEndLoad * 100).toFixed(2)}</span><span className="text-xs font-bold text-amber-500 ml-1">%</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'primary' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm border-l-4 border-l-blue-500">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3"><div className="bg-blue-100 p-2 rounded-full"><i className="fas fa-burn text-blue-600"></i></div><h3 className="text-lg font-bold text-gray-800">Primary Reformer Control Station</h3></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <label className="block text-xs font-bold text-blue-700 uppercase">Primary CH4 Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.primaryCh4Conv === 0 ? "0" : Number((params.primaryCh4Conv * 100).toFixed(4))} onChange={e => setParams({...params, primaryCh4Conv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-blue-200 rounded-md p-3 pr-12 font-mono text-lg text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-blue-400">%</span>
                      </div>
                    </div>
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <label className="block text-xs font-bold text-blue-700 uppercase">Primary CO Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.primaryCoConv === 0 ? "0" : Number((params.primaryCoConv * 100).toFixed(4))} onChange={e => setParams({...params, primaryCoConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-blue-200 rounded-md p-3 pr-12 font-mono text-lg text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-blue-400">%</span>
                      </div>
                    </div>
                  </div>
                  {renderOpControlRow('primary')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable title="PRIMARY REFORMER Inlet" data={plantData.primary.inlet} />
                <StreamTable title="PRIMARY REFORMER Outlet" data={plantData.primary.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'secondary' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-orange-200 shadow-sm border-l-4 border-l-orange-500">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3"><div className="bg-orange-100 p-2 rounded-full"><i className="fas fa-wind text-orange-600"></i></div><h3 className="text-lg font-bold text-gray-800">Secondary Reformer Control Station</h3></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                      <label className="block text-xs font-bold text-orange-700 uppercase">Secondary CH4 Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.secondaryCh4Conv === 0 ? "0" : Number((params.secondaryCh4Conv * 100).toFixed(4))} onChange={e => setParams({...params, secondaryCh4Conv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-orange-200 rounded-md p-3 pr-12 font-mono text-lg text-orange-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-orange-400">%</span>
                      </div>
                    </div>
                    <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                      <label className="block text-xs font-bold text-orange-700 uppercase">Secondary CO Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.secondaryCoConv === 0 ? "0" : Number((params.secondaryCoConv * 100).toFixed(4))} onChange={e => setParams({...params, secondaryCoConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-orange-200 rounded-md p-3 pr-12 font-mono text-lg text-orange-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-orange-400">%</span>
                      </div>
                    </div>
                    <div className="bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                      <label className="block text-xs font-bold text-orange-700 uppercase">Secondary O2 Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.secondaryO2Conv === 0 ? "0" : Number((params.secondaryO2Conv * 100).toFixed(4))} onChange={e => setParams({...params, secondaryO2Conv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-orange-200 rounded-md p-3 pr-12 font-mono text-lg text-orange-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-orange-400">%</span>
                      </div>
                    </div>
                  </div>
                  {renderOpControlRow('secondary')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable title="SECONDARY REFORMER Inlet" data={plantData.secondary.inlet} />
                <StreamTable title="SECONDARY REFORMER Outlet" data={plantData.secondary.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'hts' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm border-l-4 border-l-blue-600">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3"><div className="bg-blue-100 p-2 rounded-full"><i className="fas fa-angle-double-up text-blue-600"></i></div><h3 className="text-lg font-bold text-gray-800">HTS Shift Control Station</h3></div>
                  <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 max-w-sm"><label className="block text-xs font-bold text-blue-700 uppercase">HTS CO Conversion</label><div className="relative mt-2"><input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.htsCoConv === 0 ? "0" : Number((params.htsCoConv * 100).toFixed(4))} onChange={e => setParams({...params, htsCoConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-blue-200 rounded-md p-3 pr-12 font-mono text-lg text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/><span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-blue-400">%</span></div></div>
                  {renderOpControlRow('hts')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable title="HTS Inlet Stream" data={plantData.hts.inlet} />
                <StreamTable title="HTS Outlet Stream" data={plantData.hts.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'lts' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm border-l-4 border-l-emerald-600">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3"><div className="bg-emerald-100 p-2 rounded-full"><i className="fas fa-angle-double-down text-emerald-600"></i></div><h3 className="text-lg font-bold text-gray-800">LTS Shift Control Station</h3></div>
                  <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100 max-w-sm"><label className="block text-xs font-bold text-emerald-700 uppercase">LTS CO Conversion</label><div className="relative mt-2"><input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.ltsCoConv === 0 ? "0" : Number((params.ltsCoConv * 100).toFixed(4))} onChange={e => setParams({...params, ltsCoConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-emerald-200 rounded-md p-3 pr-12 font-mono text-lg text-emerald-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/><span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-emerald-400">%</span></div></div>
                  {renderOpControlRow('lts')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable title="LTS Inlet Stream" data={plantData.lts.inlet} />
                <StreamTable title="LTS Outlet Stream" data={plantData.lts.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'methanator' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-purple-200 shadow-sm border-l-4 border-l-purple-600">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3">
                    <div className="bg-purple-100 p-2 rounded-full"><i className="fas fa-flask-vial text-purple-600"></i></div>
                    <h3 className="text-lg font-bold text-gray-800">Methanator Control Station</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                      <label className="block text-xs font-bold text-purple-700 uppercase">CO Methanation Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.methanatorCoConv === 0 ? "0" : Number((params.methanatorCoConv * 100).toFixed(4))} onChange={e => setParams({...params, methanatorCoConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-purple-200 rounded-md p-3 pr-12 font-mono text-lg text-purple-700 focus:ring-2 focus:ring-purple-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-purple-400">%</span>
                      </div>
                    </div>
                    <div className="bg-fuchsia-50/50 p-4 rounded-lg border border-fuchsia-100">
                      <label className="block text-xs font-bold text-fuchsia-700 uppercase">CO2 Methanation Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.methanatorCo2Conv === 0 ? "0" : Number((params.methanatorCo2Conv * 100).toFixed(4))} onChange={e => setParams({...params, methanatorCo2Conv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-fuchsia-200 rounded-md p-3 pr-12 font-mono text-lg text-fuchsia-700 focus:ring-2 focus:ring-fuchsia-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-fuchsia-400">%</span>
                      </div>
                    </div>
                  </div>
                  {renderOpControlRow('methanator')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable title="METHANATOR Inlet Stream" data={plantData.methanator.inlet} isEditable onEdit={handleMethanatorInletEdit} />
                <StreamTable title="METHANATOR Outlet Stream" data={plantData.methanator.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'ammoniaReactor' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-indigo-200 shadow-sm border-l-4 border-l-indigo-600">
                <div className="flex flex-col space-y-4">
                  <div className="flex items-center space-x-3 border-b border-gray-100 pb-3">
                    <div className="bg-indigo-100 p-2 rounded-full"><i className="fas fa-vial-circle-check text-indigo-600"></i></div>
                    <h3 className="text-lg font-bold text-gray-800">Ammonia Reactor Control Station</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                      <label className="block text-xs font-bold text-indigo-700 uppercase">Reactor Nitrogen Conversion</label>
                      <div className="relative mt-2">
                        <input type="number" step="0.0001" min="0" max="100" onFocus={handleFocus} value={params.reactorConv === 0 ? "0" : Number((params.reactorConv * 100).toFixed(4))} onChange={e => setParams({...params, reactorConv: (parseFloat(e.target.value) || 0) / 100})} className="w-full border border-indigo-200 rounded-md p-3 pr-12 font-mono text-lg text-indigo-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner"/>
                        <span className="absolute right-4 top-3.5 text-lg font-mono font-bold text-indigo-400">%</span>
                      </div>
                    </div>
                    <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100">
                      <label className="block text-xs font-bold text-emerald-700 uppercase">HN Ratio (H2/N2)</label>
                      <div className="relative mt-2">
                        <div className="w-full bg-white border border-emerald-200 rounded-md p-3 font-mono text-lg font-bold text-emerald-700 text-center shadow-inner">
                          {hnRatio.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {renderOpControlRow('ammoniaReactor')}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <StreamTable 
                  title="AMMONIA REACTOR Inlet Stream" 
                  data={plantData.ammoniaReactor.inlet} 
                  isEditable 
                  onEdit={handleAmmoniaReactorInletEdit} 
                />
                <StreamTable title="AMMONIA REACTOR Outlet Stream" data={plantData.ammoniaReactor.outlet} />
              </div>
              {renderDownloadButtons()}
            </div>
          )}

          {activeTab === 'charts' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6 text-center text-gray-800">Molar Composition Profile (Wet Mole %)</h3>
                <div className="h-[450px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} />
                      <YAxis tick={{fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} unit="%" />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar dataKey="Feed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="P. Ref" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="S. Ref" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="HTS" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="LTS" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Meth" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="React" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 p-10 mt-12 text-slate-400">
        <div className="container mx-auto flex justify-center text-xs">
          <div className="text-center">
            <div className="mb-4"><i className="fas fa-calculator text-3xl text-emerald-500 opacity-80"></i></div>
            <p className="text-slate-300 font-semibold">Developed by Muhammad Ans, Process Control Engineer.</p>
            <p className="mt-1 opacity-50">&copy; 2026 | All rights reserved.</p>
          </div>
        </div>
      </footer>
      
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeInUp { animation: fadeInUp 1s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleUp { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default App;
