
import React, { useState, useMemo, useEffect } from 'react';
import { 
  calculateStreamDerivedData, 
  calculatePrimaryReformer, 
  calculateSecondaryReformer, 
  calculateShiftConverter,
  calculateMethanator,
  calculateAmmoniaReactor
} from './services/balanceService';
import { ComponentKey, StreamData } from './types';
import { COMPONENTS, CONVERSION_FACTOR } from './constants';
import StreamTable from './components/StreamTable';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // --- 1. Process Gas Specification (Dry) ---
  const [processGasPercents, setProcessGasPercents] = useState<Record<ComponentKey, number>>(() => {
    const p: any = {}; COMPONENTS.forEach(c => p[c] = 0);
    p.CH4 = 95.0; p.C2H6 = 2.5; p.CO2 = 0.5; p.H2 = 2.0;
    return p;
  });
  const [processGasFlow, setProcessGasFlow] = useState<number>(100000);

  // --- 2. Recycle Gas Specification (Dry) ---
  const [recycleGasPercents, setRecycleGasPercents] = useState<Record<ComponentKey, number>>(() => {
    const r: any = {}; COMPONENTS.forEach(c => r[c] = 0);
    r.H2 = 74.0; r.N2 = 20.0; r.CH4 = 5.0; r.AR = 0.3; r.NH3 = 0.7;
    return r;
  });
  const [recycleGasFlow, setRecycleGasFlow] = useState<number>(5000);

  // --- 3. Steam Specification ---
  const [steamFlowTons, setSteamFlowTons] = useState<number>(130);

  // --- 4. Air Feed Specification ---
  const [airPercents, setAirPercents] = useState<Record<ComponentKey, number>>(() => {
    const a: any = {}; COMPONENTS.forEach(c => a[c] = 0);
    a.N2 = 78.08; a.O2 = 20.95; a.AR = 0.93; a.CO2 = 0.04;
    return a;
  });
  const [processAirFlow, setProcessAirFlow] = useState<number>(35000);
  const [relativeHumidity, setRelativeHumidity] = useState<number>(60);
  const [ambientTemp, setAmbientTemp] = useState<number>(30);

  // --- Design Basis ---
  const [designProcessGasFlow, setDesignProcessGasFlow] = useState<number>(110000);
  const [designCarbonNumber, setDesignCarbonNumber] = useState<number>(1.05);

  // --- Operational Parameters (T, P) ---
  const [opParams, setOpParams] = useState({
    primary: { tin: 520, tout: 810, pin: 35.0, pout: 32.5 },
    secondary: { tin: 810, tout: 980, pin: 32.0, pout: 31.0 },
    hts: { tin: 360, tout: 420, pin: 30.5, pout: 29.8 },
    lts: { tin: 200, tout: 225, pin: 29.5, pout: 28.5 },
    methanator: { tin: 280, tout: 320, pin: 27.5, pout: 26.8 },
    ammoniaReactor: { tin: 380, tout: 450, pin: 150.0, pout: 145.0 },
  });

  // --- Conversion Parameters ---
  const [params, setParams] = useState({
    primaryCh4Conv: 0.65, primaryC2h6Conv: 1.0, primaryCoConv: 0.1,
    secondaryCh4Conv: 0.95, secondaryCoConv: 0.15, secondaryO2Conv: 1.0,
    htsCoConv: 0.8, ltsCoConv: 0.95,
    methanatorCoConv: 1.0, methanatorCo2Conv: 1.0,
    reactorConv: 0.15,
  });

  // --- Inlet Overrides ---
  const [customMethanatorInlet, setCustomMethanatorInlet] = useState<Record<ComponentKey, number> | null>(null);
  const [customReactorInlet, setCustomReactorInlet] = useState<Record<ComponentKey, number> | null>(null);

  const tabs = [
    { id: 'inputs', label: 'Feed & Config', icon: 'fa-vials' },
    { id: 'primary', label: 'Primary Reformer', icon: 'fa-fire-alt' },
    { id: 'secondary', label: 'Secondary Reformer', icon: 'fa-wind' },
    { id: 'hts', label: 'HTS Shift', icon: 'fa-angle-double-up' },
    { id: 'lts', label: 'LTS Shift', icon: 'fa-angle-double-down' },
    { id: 'methanator', label: 'Methanator', icon: 'fa-flask-vial' },
    { id: 'ammoniaReactor', label: 'Ammonia Reactor', icon: 'fa-vial-circle-check' },
    { id: 'external_insights', label: 'Ammonia Insights', icon: 'fa-chart-line', isExternal: true },
  ];

  const [activeTab, setActiveTab] = useState<string>('inputs');

  const currentTabLabel = useMemo(() => tabs.find(t => t.id === activeTab)?.label || "", [activeTab]);

  // --- Persistance Logic ---
  useEffect(() => {
    const savedData = localStorage.getItem('aps_simulation_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.processGasPercents) setProcessGasPercents(parsed.processGasPercents);
        if (parsed.processGasFlow) setProcessGasFlow(parsed.processGasFlow);
        if (parsed.recycleGasPercents) setRecycleGasPercents(parsed.recycleGasPercents);
        if (parsed.recycleGasFlow) setRecycleGasFlow(parsed.recycleGasFlow);
        if (parsed.steamFlowTons) setSteamFlowTons(parsed.steamFlowTons);
        if (parsed.airPercents) setAirPercents(parsed.airPercents);
        if (parsed.processAirFlow) setProcessAirFlow(parsed.processAirFlow);
        if (parsed.relativeHumidity) setRelativeHumidity(parsed.relativeHumidity);
        if (parsed.ambientTemp) setAmbientTemp(parsed.ambientTemp);
        if (parsed.designProcessGasFlow) setDesignProcessGasFlow(parsed.designProcessGasFlow);
        if (parsed.designCarbonNumber) setDesignCarbonNumber(parsed.designCarbonNumber);
        if (parsed.opParams) setOpParams(parsed.opParams);
        if (parsed.params) setParams(parsed.params);
        if (parsed.customMethanatorInlet) setCustomMethanatorInlet(parsed.customMethanatorInlet);
        if (parsed.customReactorInlet) setCustomReactorInlet(parsed.customReactorInlet);
      } catch (e) {
        console.error("Failed to load saved simulation data", e);
      }
    }
  }, []);

  const handleSave = () => {
    setSaveStatus('saving');
    const dataToSave = {
      processGasPercents, processGasFlow,
      recycleGasPercents, recycleGasFlow,
      steamFlowTons,
      airPercents, processAirFlow, relativeHumidity, ambientTemp,
      designProcessGasFlow, designCarbonNumber,
      opParams, params,
      customMethanatorInlet, customReactorInlet
    };
    localStorage.setItem('aps_simulation_data', JSON.stringify(dataToSave));
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }, 500);
  };

  // --- Stream Calculations ---
  const processGasCalculated = useMemo(() => {
    const moles: Record<ComponentKey, number> = {} as any;
    COMPONENTS.forEach(c => {
      const compNmc = (processGasPercents[c] / 100) * processGasFlow;
      moles[c] = compNmc / CONVERSION_FACTOR;
    });
    const data = calculateStreamDerivedData(moles);
    COMPONENTS.forEach(c => data.moleFractions[c] = processGasPercents[c] / 100);
    return data;
  }, [processGasPercents, processGasFlow]);

  const recycleGasCalculated = useMemo(() => {
    const moles: Record<ComponentKey, number> = {} as any;
    COMPONENTS.forEach(c => {
      const compNmc = (recycleGasPercents[c] / 100) * recycleGasFlow;
      moles[c] = compNmc / CONVERSION_FACTOR;
    });
    const data = calculateStreamDerivedData(moles);
    COMPONENTS.forEach(c => data.moleFractions[c] = recycleGasPercents[c] / 100);
    return data;
  }, [recycleGasPercents, recycleGasFlow]);

  const steamDerived = useMemo(() => {
    const kgHr = steamFlowTons * 1000;
    const kgmolHr = kgHr / 18;
    const nmcHr = kgmolHr * CONVERSION_FACTOR;
    return { kgHr, kgmolHr, nmcHr };
  }, [steamFlowTons]);

  const feedGasCalculated = useMemo(() => {
    const pg = processGasCalculated;
    const rg = recycleGasCalculated;
    const combinedMoles: Record<ComponentKey, number> = {} as any;
    COMPONENTS.forEach(c => {
      combinedMoles[c] = (pg.moles[c] || 0) + (rg.moles[c] || 0);
    });
    combinedMoles.H2O = (combinedMoles.H2O || 0) + steamDerived.kgmolHr;
    return calculateStreamDerivedData(combinedMoles);
  }, [processGasCalculated, recycleGasCalculated, steamDerived]);

  const airCalculated = useMemo(() => {
    const pSat = 6.112 * Math.exp((17.67 * ambientTemp) / (ambientTemp + 243.5));
    const pVapor = (relativeHumidity / 100) * pSat;
    const pAtm = 1013.25;
    const yH2O = pVapor / pAtm;

    const dryMoles: Record<ComponentKey, number> = {} as any;
    let totalDryNmc = 0;
    COMPONENTS.forEach(c => {
      if (c !== 'H2O') {
        const compNmc = (airPercents[c] / 100) * processAirFlow;
        dryMoles[c] = compNmc / CONVERSION_FACTOR;
        totalDryNmc += compNmc;
      }
    });

    const dryKgmolSum = totalDryNmc / CONVERSION_FACTOR;
    const h2oKgmol = dryKgmolSum * (yH2O / (1 - yH2O));
    
    const finalMoles = { ...dryMoles, H2O: h2oKgmol };
    const data = calculateStreamDerivedData(finalMoles);
    COMPONENTS.forEach(c => data.moleFractions[c] = c === 'H2O' ? 0 : airPercents[c] / 100);
    return data;
  }, [airPercents, processAirFlow, relativeHumidity, ambientTemp]);

  const plantData = useMemo(() => {
    const pg = processGasCalculated;
    const rg = recycleGasCalculated;
    const air = airCalculated;
    
    const combinedMoles: Record<ComponentKey, number> = {} as any;
    COMPONENTS.forEach(c => combinedMoles[c] = (pg.moles[c] || 0) + (rg.moles[c] || 0));
    combinedMoles.H2O = steamDerived.kgmolHr;
    const primaryInlet = calculateStreamDerivedData(combinedMoles);

    const pOutMoles = calculatePrimaryReformer(combinedMoles, params.primaryCh4Conv, params.primaryC2h6Conv, params.primaryCoConv);
    const sOutMoles = calculateSecondaryReformer(pOutMoles, air.moles, params.secondaryCh4Conv, params.secondaryCoConv, params.secondaryO2Conv);
    const htsOutMoles = calculateShiftConverter(sOutMoles, params.htsCoConv);
    const ltsOutMoles = calculateShiftConverter(htsOutMoles, params.ltsCoConv);

    // Priority: Custom Methanator Inlet > Calculated LTS Outlet
    const methInletMoles = customMethanatorInlet || ltsOutMoles;
    const methOutMoles = calculateMethanator(methInletMoles, params.methanatorCoConv, params.methanatorCo2Conv);
    
    // Priority: Custom Reactor Inlet > Calculated Methanator Outlet
    const ammInletMoles = customReactorInlet || methOutMoles;
    const reactOutMoles = calculateAmmoniaReactor(ammInletMoles, params.reactorConv);

    return {
      processGas: pg, recycleGas: rg, air,
      primary: { inlet: primaryInlet, outlet: calculateStreamDerivedData(pOutMoles) },
      secondary: { inlet: calculateStreamDerivedData(pOutMoles), outlet: calculateStreamDerivedData(sOutMoles) },
      hts: { inlet: calculateStreamDerivedData(sOutMoles), outlet: calculateStreamDerivedData(htsOutMoles) },
      lts: { inlet: calculateStreamDerivedData(htsOutMoles), outlet: calculateStreamDerivedData(ltsOutMoles) },
      methanator: { inlet: calculateStreamDerivedData(methInletMoles), outlet: calculateStreamDerivedData(methOutMoles) },
      ammoniaReactor: { inlet: calculateStreamDerivedData(ammInletMoles), outlet: calculateStreamDerivedData(reactOutMoles) }
    };
  }, [processGasCalculated, recycleGasCalculated, airCalculated, steamDerived, params, customMethanatorInlet, customReactorInlet]);

  // --- KPI Formulas ---
  const processGasCarbonNo = useMemo(() => {
    const p = processGasPercents;
    return 1 * (p.CH4 / 100) + 2 * (p.C2H6 / 100) + 1 * (p.CO2 / 100) + 1 * (p.CO / 100);
  }, [processGasPercents]);

  const steamToCarbonRatio = useMemo(() => {
    const p = processGasPercents;
    const carbonNo = 1 * (p.CH4 / 100) + 2 * (p.C2H6 / 100) + 1 * (p.CO2 / 100) + 1 * (p.CO / 100);
    if (carbonNo === 0 || processGasFlow === 0) return 0;
    return (steamFlowTons * 1245.2222222) / (carbonNo * processGasFlow);
  }, [steamFlowTons, processGasPercents, processGasFlow]);

  const frontEndLoad = useMemo(() => {
    const p = processGasPercents;
    const carbonNo = 1 * (p.CH4 / 100) + 2 * (p.C2H6 / 100) + 1 * (p.CO2 / 100) + 1 * (p.CO / 100);
    const denominator = designProcessGasFlow * designCarbonNumber;
    if (denominator === 0) return 0;
    return (carbonNo * processGasFlow) / denominator;
  }, [processGasPercents, processGasFlow, designProcessGasFlow, designCarbonNumber]);

  const gasToAirRatio = useMemo(() => {
    if (processAirFlow === 0) return 0;
    return (processGasFlow + recycleGasFlow) / processAirFlow;
  }, [processGasFlow, recycleGasFlow, processAirFlow]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

  const updateOpParam = (unit: keyof typeof opParams, key: 'tin'|'tout'|'pin'|'pout', val: string) => {
    setOpParams(prev => ({ ...prev, [unit]: { ...prev[unit], [key]: parseFloat(val) || 0 } }));
  };

  const formatStreamDataForExport = (name: string, data: StreamData) => {
    const rows = COMPONENTS.map(c => [
      c,
      data.moles[c].toFixed(4),
      (data.moles[c] * CONVERSION_FACTOR).toFixed(2),
      (data.moleFractions[c] * 100).toFixed(4),
      ((c === 'H2O' ? 0 : (data.moles[c] / (data.totalMoles - data.moles.H2O))) * 100 || 0).toFixed(4)
    ]);
    return { name, rows };
  };

  const getActiveTabMetadata = () => {
    const sections: any[] = [];
    if (activeTab === 'inputs') {
      sections.push({
        title: "Operational KPI Summary",
        headers: ["Parameter", "Value"],
        body: [
          ["Process Gas Carbon No.", processGasCarbonNo.toFixed(4)],
          ["Steam to Carbon Ratio", steamToCarbonRatio.toFixed(4)],
          ["Front End Load", `${(frontEndLoad * 100).toFixed(2)}%`],
          ["Gas to Air Ratio", gasToAirRatio.toFixed(4)]
        ]
      });
      sections.push({
        title: "Design Basis",
        headers: ["Basis Name", "Value", "Unit"],
        body: [
          ["Design Process Gas Flow", designProcessGasFlow, "NMC/hr"],
          ["Design Carbon No.", designCarbonNumber, "-"]
        ]
      });
    } else {
      const unitKey = activeTab as keyof typeof opParams;
      const op = opParams[unitKey];
      sections.push({
        title: "Operating Conditions",
        headers: ["Parameter", "Inlet", "Outlet", "Δ"],
        body: [
          ["Temperature (°C)", op.tin, op.tout, (op.tout - op.tin).toFixed(2)],
          ["Pressure (kg/cm²g)", op.pin, op.pout, (op.pout - op.pin).toFixed(2)]
        ]
      });

      // Tab specific kinetics
      const kinetics: string[][] = [];
      if (activeTab === 'primary') {
        kinetics.push(["CH4 Conversion (%)", (params.primaryCh4Conv * 100).toFixed(2)]);
        kinetics.push(["CO Conversion (%)", (params.primaryCoConv * 100).toFixed(2)]);
      } else if (activeTab === 'secondary') {
        kinetics.push(["CH4 Conversion (%)", (params.secondaryCh4Conv * 100).toFixed(2)]);
        kinetics.push(["CO Conversion (%)", (params.secondaryCoConv * 100).toFixed(2)]);
        kinetics.push(["O2 Conversion (%)", (params.secondaryO2Conv * 100).toFixed(2)]);
      } else if (activeTab === 'hts') {
        kinetics.push(["CO Conversion (%)", (params.htsCoConv * 100).toFixed(2)]);
      } else if (activeTab === 'lts') {
        kinetics.push(["CO Conversion (%)", (params.ltsCoConv * 100).toFixed(2)]);
      } else if (activeTab === 'methanator') {
        kinetics.push(["CO Conversion (%)", (params.methanatorCoConv * 100).toFixed(2)]);
        kinetics.push(["CO2 Conversion (%)", (params.methanatorCo2Conv * 100).toFixed(2)]);
      } else if (activeTab === 'ammoniaReactor') {
        kinetics.push(["H2 Conversion (%)", (params.reactorConv * 100).toFixed(2)]);
        const ammInlet = plantData.ammoniaReactor.inlet;
        const hnRatio = ammInlet.moles.N2 > 0 ? (ammInlet.moles.H2 / ammInlet.moles.N2) : 0;
        kinetics.push(["HN Ratio (H2/N2)", hnRatio.toFixed(3)]);
      }

      sections.push({
        title: "Kinetics / Performance Controls",
        headers: ["Control Parameter", "Target Value"],
        body: kinetics
      });
    }
    return sections;
  };

  const getActiveTabTables = () => {
    const tables: any[] = [];
    if (activeTab === 'inputs') {
      tables.push(formatStreamDataForExport("1. Process Gas Specification (Dry)", plantData.processGas));
      tables.push(formatStreamDataForExport("2. Recycle Gas Specification (Dry)", plantData.recycleGas));
      tables.push(formatStreamDataForExport("4. Feed Gas Specification (Combined Feed)", feedGasCalculated));
      tables.push(formatStreamDataForExport("5. Air Feed Specification", plantData.air));
    } else {
      const unit = activeTab as keyof typeof plantData;
      if (plantData[unit] && 'inlet' in plantData[unit]) {
        tables.push(formatStreamDataForExport(`${currentTabLabel} Inlet`, (plantData[unit] as any).inlet));
        tables.push(formatStreamDataForExport(`${currentTabLabel} Outlet`, (plantData[unit] as any).outlet));
      }
    }
    return tables;
  };

  const handleDownloadExcel = () => {
    const timestamp = new Date().toLocaleString();
    const wb = XLSX.utils.book_new();
    
    // Header Info
    const headerData = [
      ["Ammonia Plant"],
      ["Process Simulator (APS)"],
      [`Tab: ${currentTabLabel}`],
      [`Downloaded At: ${timestamp}`],
      []
    ];

    const allData: any[] = [...headerData];

    // Meta Data Sections (Op Conditions, Kinetics)
    const metaSections = getActiveTabMetadata();
    metaSections.forEach(sec => {
      allData.push([sec.title.toUpperCase()]);
      allData.push(sec.headers);
      sec.body.forEach((row: any) => allData.push(row));
      allData.push([]);
    });

    // Stream Tables
    const tables = getActiveTabTables();
    tables.forEach(table => {
      allData.push([table.name.toUpperCase()]);
      allData.push(["Component", "Kgmol/hr", "NMC/hr", "Wet mol%", "Dry mol%"]);
      table.rows.forEach((row: any) => allData.push(row));
      allData.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, ws, "Material Balance");
    XLSX.writeFile(wb, `Ammonia_Plant_APS_${activeTab.toUpperCase()}.xlsx`);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const timestamp = new Date().toLocaleString();
    
    // Title & Metadata
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text('Ammonia Plant', 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); 
    doc.text('Process Simulator (APS)', 14, 28);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Tab: ${currentTabLabel}`, 14, 38);
    doc.text(`Downloaded At: ${timestamp}`, 14, 44);

    let lastY = 50;

    // Operational Meta Sections
    const metaSections = getActiveTabMetadata();
    metaSections.forEach(sec => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(sec.title.toUpperCase(), 14, lastY + 5);
      autoTable(doc, {
        startY: lastY + 8,
        head: [sec.headers],
        body: sec.body,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8 }
      });
      lastY = (doc as any).lastAutoTable.finalY + 5;
    });

    // Stream Data Tables
    const tables = getActiveTabTables();
    tables.forEach(table => {
      // Check for page overflow
      if (lastY > 240) {
        doc.addPage();
        lastY = 20;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(table.name.toUpperCase(), 14, lastY + 5);
      autoTable(doc, {
        startY: lastY + 8,
        head: [['Component', 'Kgmol/hr', 'NMC/hr', 'Wet mol%', 'Dry mol%']],
        body: table.rows,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 8 }
      });
      lastY = (doc as any).lastAutoTable.finalY + 5;
    });

    doc.save(`Ammonia_Plant_APS_${activeTab.toUpperCase()}.pdf`);
  };

  const handleMethanatorInletEdit = (comp: ComponentKey, value: number) => {
    const currentInlet = customMethanatorInlet || plantData.methanator.inlet.moles;
    setCustomMethanatorInlet({ ...currentInlet, [comp]: value });
  };

  const handleReactorInletEdit = (comp: ComponentKey, value: number) => {
    // Start with existing calculated or existing override
    const currentInlet = customReactorInlet || plantData.ammoniaReactor.inlet.moles;
    setCustomReactorInlet({ ...currentInlet, [comp]: value });
  };

  const renderOpTable = (unitKey: keyof typeof opParams) => {
    const p = opParams[unitKey];
    const dt = p.tout - p.tin;
    const dp = p.pout - p.pin; // ΔP = Pout - Pin (matches image logic)
    
    const cardClass = "flex flex-col flex-1 min-w-[150px] p-3 rounded-lg border border-slate-200 bg-slate-50 shadow-sm items-center";
    const labelClass = "text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-tight text-center";
    const inputContainerClass = "bg-white border border-slate-200 rounded p-1.5 flex items-center justify-center h-10 w-full";
    const valueClass = "text-sm font-bold font-mono text-slate-800 focus:outline-none w-full text-center bg-transparent";

    return (
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-gauge-high mr-2 text-blue-500"></i> Operating Conditions
        </h3>
        <div className="flex flex-wrap gap-3">
          {/* Inlet Temp */}
          <div className={cardClass}>
            <span className={labelClass}>INLET TEMP (°C)</span>
            <div className={inputContainerClass}>
              <input 
                type="number" 
                onFocus={handleFocus} 
                value={p.tin} 
                onChange={e => updateOpParam(unitKey, 'tin', e.target.value)} 
                className={valueClass}
              />
            </div>
          </div>

          {/* Outlet Temp */}
          <div className={cardClass}>
            <span className={labelClass}>OUTLET TEMP (°C)</span>
            <div className={inputContainerClass}>
              <input 
                type="number" 
                onFocus={handleFocus} 
                value={p.tout} 
                onChange={e => updateOpParam(unitKey, 'tout', e.target.value)} 
                className={valueClass}
              />
            </div>
          </div>

          {/* Inlet Pres */}
          <div className={cardClass}>
            <span className={labelClass}>INLET PRES (KG/CM²G)</span>
            <div className={inputContainerClass}>
              <input 
                type="number" 
                onFocus={handleFocus} 
                value={p.pin} 
                onChange={e => updateOpParam(unitKey, 'pin', e.target.value)} 
                className={valueClass}
              />
            </div>
          </div>

          {/* Outlet Pres */}
          <div className={cardClass}>
            <span className={labelClass}>OUTLET PRES (KG/CM²G)</span>
            <div className={inputContainerClass}>
              <input 
                type="number" 
                onFocus={handleFocus} 
                value={p.pout} 
                onChange={e => updateOpParam(unitKey, 'pout', e.target.value)} 
                className={valueClass}
              />
            </div>
          </div>

          {/* Delta T */}
          <div className="flex flex-col flex-1 min-w-[150px] p-3 rounded-lg border border-green-200 bg-green-50 shadow-sm items-center">
            <span className={`${labelClass} text-green-700`}>ΔT (°C)</span>
            <div className="bg-white border border-green-100 rounded p-1.5 flex items-center justify-center h-10 w-full">
              <span className="text-sm font-bold font-mono text-green-700 text-center">{dt.toFixed(2)}</span>
            </div>
          </div>

          {/* Delta P */}
          <div className="flex flex-col flex-1 min-w-[150px] p-3 rounded-lg border border-orange-200 bg-orange-50 shadow-sm items-center">
            <span className={`${labelClass} text-orange-700`}>ΔP (KG/CM²)</span>
            <div className="bg-white border border-orange-100 rounded p-1.5 flex items-center justify-center h-10 w-full">
              <span className="text-sm font-bold font-mono text-orange-700 text-center">{dp.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (showLanding) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-900 text-white overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500 blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500 blur-[120px] animate-pulse"></div>
        </div>

        <div className="z-10 text-center px-6 max-w-4xl flex flex-col items-center">
          <div className="mb-8 inline-flex items-center justify-center p-4 rounded-3xl bg-slate-800/50 border border-slate-700 backdrop-blur-md shadow-2xl">
            <i className="fas fa-industry text-6xl text-emerald-400"></i>
          </div>
          
          <div className="mb-12 flex flex-col items-center">
            <h1 className="text-7xl md:text-9xl font-extrabold tracking-tight drop-shadow-lg leading-none mb-2">
              Ammonia
            </h1>
            <h2 className="text-2xl md:text-4xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 uppercase">
              Process Simulator (APS)
            </h2>
          </div>

          <button 
            onClick={() => setShowLanding(false)}
            className="group relative inline-flex items-center justify-center px-12 py-5 font-bold text-white transition-all duration-200 bg-emerald-600 rounded-2xl hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 shadow-xl"
          >
            <span className="relative flex items-center text-xl uppercase tracking-widest">
              Let’s Begin
            </span>
          </button>
        </div>
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
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Process Simulator (APS)</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleSave} 
              className={`px-3 h-9 rounded text-xs font-bold uppercase transition-all border flex items-center space-x-2 ${
                saveStatus === 'saved' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
              }`}
            >
              <i className={`fas ${saveStatus === 'saving' ? 'fa-spinner fa-spin' : (saveStatus === 'saved' ? 'fa-check' : 'fa-save')} text-emerald-400`}></i>
              <span className="hidden sm:inline">{saveStatus === 'saved' ? 'Saved' : 'Save'}</span>
            </button>
            <button onClick={() => setIsAboutOpen(true)} className="bg-slate-800 hover:bg-slate-700 text-white px-3 h-9 rounded text-xs font-bold uppercase transition-all border border-slate-700">
              <i className="fas fa-info-circle text-emerald-400"></i>
            </button>
          </div>
        </div>
      </header>

      {isAboutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsAboutOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-6 text-slate-800 flex items-center">
              <i className="fas fa-circle-info mr-3 text-blue-500"></i>
              Ammonia Process Simulator (APS)
            </h2>
            <div className="text-gray-700 space-y-4 leading-relaxed text-sm md:text-base">
              <p>
                <strong>Ammonia Process Simulator (APS)</strong> is an interactive engineering tool designed to perform detailed material balance calculations across an entire ammonia plant.
              </p>
              <p>
                The simulator allows users to define feed compositions, operating conditions, and conversion parameters, and instantly visualize their impact across major process units including reformers, shift converters, methanator, and ammonia reactor. Both wet and dry mole fractions, mass and volumetric flows, and key performance indicators such as Carbon Number, Steam-to-Carbon ratio, Front End Load, ΔT, ΔP, and H/N ratio are calculated dynamically.
              </p>
              <p>
                Built with a strong focus on process fundamentals, transparency of calculations, and engineering accuracy, this app serves as a powerful learning, analysis, and what-if simulation platform for operation and practicing process engineers working in ammonia and syngas plants.
              </p>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-1">Developed By</p>
                <p className="text-lg font-bold text-slate-800">Muhammad Ans</p>
                <p className="text-sm font-semibold text-blue-600">Process & Control Engineer</p>
              </div>
              <button 
                onClick={() => setIsAboutOpen(false)} 
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-2 rounded-lg font-bold transition-colors shadow-md self-end md:self-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
        {/* Sticky Tab Navigation */}
        <div className="sticky top-[73px] z-40 bg-gray-50/95 backdrop-blur-sm pb-4 -mx-4 px-4">
          <div className="flex flex-wrap border-b border-gray-200 gap-1 bg-white p-1 rounded-lg shadow-sm">
            {tabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => {
                  if (tab.id === 'external_insights') {
                    window.open('https://ammonia-insights.vercel.app/', '_blank');
                  } else {
                    setActiveTab(tab.id);
                  }
                }} 
                className={`flex items-center space-x-2 px-6 py-3 text-sm font-semibold transition-all rounded-md ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <i className={`fas ${tab.icon}`}></i><span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-12">
          {activeTab === 'inputs' && (
            <>
              {/* Top Section: Basis and KPIs (Non-sticky) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {/* Plant Design Basis */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden h-full flex flex-col">
                  <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Plant Design Basis</h3>
                    <i className="fas fa-drafting-compass text-blue-400"></i>
                  </div>
                  <div className="p-6 space-y-6 flex-1 bg-slate-50/50">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">Design Process Gas Flow (NMC/hr)</label>
                      <input 
                        type="number" 
                        step="any" 
                        onFocus={handleFocus} 
                        value={designProcessGasFlow} 
                        onChange={e => setDesignProcessGasFlow(parseFloat(e.target.value) || 0)} 
                        className="w-full border border-slate-200 rounded-lg p-3 font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-center shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">Design Carbon No.</label>
                      <input 
                        type="number" 
                        step="any" 
                        onFocus={handleFocus} 
                        value={designCarbonNumber} 
                        onChange={e => setDesignCarbonNumber(parseFloat(e.target.value) || 0)} 
                        className="w-full border border-slate-200 rounded-lg p-3 font-mono text-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-center shadow-inner"
                      />
                    </div>
                    <div className="pt-2 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold italic">Adjust these values to calibrate plant load and KPI metrics.</p>
                    </div>
                  </div>
                </div>

                {/* Operational KPI Summary */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden h-full flex flex-col">
                  <div className="bg-slate-800 text-white px-5 py-4 flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Operational KPI Summary</h3>
                    <i className="fas fa-tachometer-alt text-emerald-400"></i>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 flex-1">
                    <div className="px-4 py-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors">
                      <span className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center">
                        <i className="fas fa-atom mr-1.5 text-slate-400"></i> PG Carbon No.
                      </span>
                      <span className="text-xl font-bold font-mono text-slate-700">{processGasCarbonNo.toFixed(4)}</span>
                    </div>
                    <div className="px-4 py-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors">
                      <span className="text-[10px] font-bold text-blue-500 uppercase mb-2 flex items-center">
                        <i className="fas fa-tint mr-1.5 text-blue-300"></i> S/C Ratio
                      </span>
                      <span className="text-xl font-bold font-mono text-blue-700">{steamToCarbonRatio.toFixed(4)}</span>
                    </div>
                    <div className="px-4 py-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors border-t border-slate-100">
                      <span className="text-[10px] font-bold text-amber-500 uppercase mb-2 flex items-center">
                        <i className="fas fa-weight-hanging mr-1.5 text-amber-300"></i> Front End Load
                      </span>
                      <div className="flex items-baseline"><span className="text-xl font-bold font-mono text-amber-700">{(frontEndLoad * 100).toFixed(2)}</span><span className="text-xs font-bold text-amber-500 ml-1">%</span></div>
                    </div>
                    <div className="px-4 py-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors border-t border-slate-100">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase mb-2 flex items-center">
                        <i className="fas fa-exchange-alt mr-1.5 text-emerald-300"></i> Gas/Air Ratio
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-700">{gasToAirRatio.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 1. Process Gas */}
              <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm border-l-4 border-l-slate-700">
                <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6"><div className="bg-slate-100 p-2 rounded-full"><i className="fas fa-gas-pump text-slate-600"></i></div><h3 className="text-lg font-bold text-gray-800">1. Process Gas Specification (Dry)</h3></div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 max-w-md mb-6"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Process Gas Flow</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={processGasFlow} onChange={e => setProcessGasFlow(parseFloat(e.target.value) || 0)} className="w-full border border-slate-200 rounded-md p-2 pr-16 font-mono text-lg text-slate-800 focus:ring-2 focus:ring-slate-500 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-[10px] font-bold text-slate-400 pointer-events-none">NMC/hr</span></div></div>
                <StreamTable title="Dry Process Gas Components" data={plantData.processGas} isEditable onPercentEdit={(comp, percent) => setProcessGasPercents(prev => ({ ...prev, [comp]: percent }))} componentsToShow={COMPONENTS.filter(c => c !== 'H2O')} hideWetPercent inputMode="dryPercentOnly"/>
              </div>

              {/* 2. Recycle Gas */}
              <div className="bg-white p-6 rounded-lg border border-teal-200 shadow-sm border-l-4 border-l-teal-600">
                <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6"><div className="bg-teal-100 p-2 rounded-full"><i className="fas fa-rotate text-teal-600"></i></div><h3 className="text-lg font-bold text-gray-800">2. Recycle Gas Specification (Dry)</h3></div>
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-100 max-w-md mb-6"><label className="block text-[10px] font-bold text-teal-600 uppercase tracking-wider text-center">Recycle Gas Flow</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={recycleGasFlow} onChange={e => setRecycleGasFlow(parseFloat(e.target.value) || 0)} className="w-full border border-teal-200 rounded-md p-2 pr-16 font-mono text-lg text-teal-800 focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-[10px] font-bold text-teal-400 pointer-events-none">NMC/hr</span></div></div>
                <StreamTable title="Dry Recycle Gas Components" data={plantData.recycleGas} isEditable onPercentEdit={(comp, percent) => setRecycleGasPercents(prev => ({ ...prev, [comp]: percent }))} componentsToShow={COMPONENTS.filter(c => c !== 'H2O')} hideWetPercent inputMode="dryPercentOnly"/>
              </div>

              {/* 3. Steam */}
              <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm border-l-4 border-l-blue-600">
                <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6"><div className="bg-blue-100 p-2 rounded-full"><i className="fas fa-faucet-detergent text-blue-600"></i></div><h3 className="text-lg font-bold text-gray-800">3. Steam Specification</h3></div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 max-w-md mb-6"><label className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider text-center">Steam Flow Rate</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={steamFlowTons} onChange={e => setSteamFlowTons(parseFloat(e.target.value) || 0)} className="w-full border border-blue-200 rounded-md p-2 pr-16 font-mono text-lg text-blue-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-[10px] font-bold text-blue-400 pointer-events-none">Tons/hr</span></div></div>
              </div>

              {/* 4. Feed Gas Specification (PRIMARY REFORMER Inlet) */}
              <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm border-l-4 border-l-emerald-600">
                <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6">
                  <div className="bg-emerald-100 p-2 rounded-full"><i className="fas fa-shuffle text-emerald-600"></i></div>
                  <h3 className="text-lg font-bold text-gray-800">4. Feed Gas Specification (Combined Feed)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 text-center">
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1 text-center">Feed Gas Flow (NMC/hr)</div>
                    <div className="text-xl font-mono font-bold text-emerald-800 text-center">{feedGasCalculated.totalVolume.toFixed(2)}</div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100 text-center">
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1 text-center">Feed Gas Flow (Kgmol/hr)</div>
                    <div className="text-xl font-mono font-bold text-emerald-800 text-center">{feedGasCalculated.totalMoles.toFixed(4)}</div>
                  </div>
                </div>
                <StreamTable title="PRIMARY REFORMER Inlet (PG + RG + Steam)" data={feedGasCalculated} readOnlyFlows/>
              </div>

              {/* 5. Air Feed */}
              <div className="bg-white p-6 rounded-lg border border-orange-200 shadow-sm border-l-4 border-l-orange-600">
                <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-6"><div className="bg-orange-100 p-2 rounded-full"><i className="fas fa-wind text-orange-600"></i></div><h3 className="text-lg font-bold text-gray-800">5. Air Feed Specification</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-100"><label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider text-center">Air Flow</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={processAirFlow} onChange={e => setProcessAirFlow(parseFloat(e.target.value) || 0)} className="w-full border border-orange-200 rounded-md p-2 pr-12 font-mono text-lg text-orange-800 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-[10px] font-bold text-orange-400 pointer-events-none">NMC/hr</span></div></div>
                  <div className="bg-sky-50 p-4 rounded-lg border border-sky-100"><label className="block text-[10px] font-bold text-sky-600 uppercase tracking-wider text-center">Rel. Humidity</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={relativeHumidity} onChange={e => setRelativeHumidity(parseFloat(e.target.value) || 0)} className="w-full border border-sky-200 rounded-md p-2 pr-8 font-mono text-lg text-sky-800 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-lg font-bold text-sky-400 pointer-events-none">%</span></div></div>
                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-100"><label className="block text-[10px] font-bold text-amber-600 uppercase tracking-wider text-center">Amb. Temp</label><div className="relative mt-2"><input type="number" step="any" onFocus={handleFocus} value={ambientTemp} onChange={e => setAmbientTemp(parseFloat(e.target.value) || 0)} className="w-full border border-amber-200 rounded-md p-2 pr-8 font-mono text-lg text-amber-800 outline-none bg-white shadow-inner text-center"/><span className="absolute right-3 inset-y-0 flex items-center text-lg font-bold text-amber-400 pointer-events-none">°C</span></div></div>
                </div>
                <StreamTable title="Air Feed Components" data={plantData.air} isEditable onPercentEdit={(comp, percent) => setAirPercents(prev => ({ ...prev, [comp]: percent }))} componentsToShow={['N2', 'O2', 'AR', 'CO2', 'H2O']} inputMode="dryPercentOnly"/>
              </div>
            </>
          )}

          {activeTab === 'primary' && (
            <div className="space-y-6">
              {renderOpTable('primary')}
              <div className="bg-white p-6 rounded-lg border border-blue-200 shadow-sm mb-6">
                <h3 className="text-lg font-bold text-blue-800 border-b pb-3 mb-4">Reformer Kinetics Control</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CH4 Conversion (%)</label>
                    <input type="number" step="0.01" onFocus={handleFocus} value={params.primaryCh4Conv * 100} onChange={e => setParams({...params, primaryCh4Conv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-blue-500 outline-none text-center"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CO Conversion (%)</label>
                    <input 
                      type="number" 
                      step="0.0001" 
                      onFocus={handleFocus} 
                      value={Number((params.primaryCoConv * 100).toFixed(4))} 
                      onChange={e => setParams({...params, primaryCoConv: parseFloat(e.target.value)/100})} 
                      className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-blue-500 outline-none text-center"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><StreamTable title="Primary Reformer Inlet" data={plantData.primary.inlet} /><StreamTable title="Primary Reformer Outlet" data={plantData.primary.outlet} /></div>
            </div>
          )}

          {activeTab === 'secondary' && (
            <div className="space-y-6">
              {renderOpTable('secondary')}
              <div className="bg-white p-6 rounded-lg border border-orange-200 shadow-sm mb-6">
                <h3 className="text-lg font-bold text-orange-800 border-b pb-3 mb-4">Secondary Reforming Controls</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CH4 Conversion (%)</label><input type="number" step="0.01" onFocus={handleFocus} value={params.secondaryCh4Conv * 100} onChange={e => setParams({...params, secondaryCh4Conv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-orange-500 outline-none text-center"/></div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CO Conversion (%)</label>
                    <input 
                      type="number" 
                      step="0.0001" 
                      onFocus={handleFocus} 
                      value={Number((params.secondaryCoConv * 100).toFixed(4))} 
                      onChange={e => setParams({...params, secondaryCoConv: parseFloat(e.target.value)/100})} 
                      className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-orange-500 outline-none text-center"
                    />
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">O2 Conversion (%)</label><input type="number" step="0.01" onFocus={handleFocus} value={params.secondaryO2Conv * 100} onChange={e => setParams({...params, secondaryO2Conv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-orange-500 outline-none text-center"/></div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><StreamTable title="Secondary Reformer Inlet" data={plantData.secondary.inlet} /><StreamTable title="Secondary Reformer Outlet" data={plantData.secondary.outlet} /></div>
            </div>
          )}

          {activeTab === 'hts' && (
            <div className="space-y-6">
              {renderOpTable('hts')}
              <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm mb-6 max-w-sm mx-auto">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">HTS CO Conversion (%)</label>
                <input type="number" step="0.01" onFocus={handleFocus} value={params.htsCoConv * 100} onChange={e => setParams({...params, htsCoConv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-emerald-500 outline-none text-center"/>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><StreamTable title="HTS Inlet" data={plantData.hts.inlet} /><StreamTable title="HTS Outlet" data={plantData.hts.outlet} /></div>
            </div>
          )}

          {activeTab === 'lts' && (
            <div className="space-y-6">
              {renderOpTable('lts')}
              <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm mb-6 max-w-sm mx-auto">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">LTS CO Conversion (%)</label>
                <input type="number" step="0.01" onFocus={handleFocus} value={params.ltsCoConv * 100} onChange={e => setParams({...params, ltsCoConv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-emerald-500 outline-none text-center"/>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><StreamTable title="LTS Inlet" data={plantData.lts.inlet} /><StreamTable title="LTS Outlet" data={plantData.lts.outlet} /></div>
            </div>
          )}

          {activeTab === 'methanator' && (
            <div className="space-y-6">
              {renderOpTable('methanator')}
              <div className="bg-white p-6 rounded-lg border border-purple-200 shadow-sm mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CO Conversion (%)</label><input type="number" step="0.01" onFocus={handleFocus} value={params.methanatorCoConv * 100} onChange={e => setParams({...params, methanatorCoConv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-purple-500 outline-none text-center"/></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">CO2 Conversion (%)</label><input type="number" step="0.01" onFocus={handleFocus} value={params.methanatorCo2Conv * 100} onChange={e => setParams({...params, methanatorCo2Conv: parseFloat(e.target.value)/100})} className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-purple-500 outline-none text-center"/></div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="relative">
                  <StreamTable 
                    title="Methanator Inlet" 
                    data={plantData.methanator.inlet} 
                    isEditable 
                    onEdit={handleMethanatorInletEdit} 
                  />
                  {customMethanatorInlet && (
                    <button 
                      onClick={() => setCustomMethanatorInlet(null)}
                      className="absolute top-2 right-24 bg-red-500 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded shadow-sm z-10 font-bold uppercase"
                    >
                      Reset to Calculated
                    </button>
                  )}
                </div>
                <StreamTable title="Methanator Outlet" data={plantData.methanator.outlet} />
              </div>
            </div>
          )}

          {activeTab === 'ammoniaReactor' && (
            <div className="space-y-6">
              {renderOpTable('ammoniaReactor')}
              <div className="bg-white p-6 rounded-lg border border-indigo-200 shadow-sm mb-6">
                <h3 className="text-lg font-bold text-indigo-800 border-b pb-3 mb-4 flex items-center">
                  <i className="fas fa-microchip mr-2"></i> Reactor Performance & Feed Control
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">H2 Conversion (%)</label>
                    <input 
                      type="number" 
                      step="0.0001" 
                      onFocus={handleFocus} 
                      value={Number((params.reactorConv * 100).toFixed(4))} 
                      onChange={e => setParams({...params, reactorConv: parseFloat(e.target.value)/100})} 
                      className="w-full border rounded p-2 font-mono focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 text-center">HN Ratio (H2/N2)</label>
                    <div className="w-full border rounded p-2 font-mono bg-slate-50 text-indigo-700 font-bold text-center border-indigo-100 flex items-center justify-center h-[38px]">
                      {(() => {
                        const ammInlet = plantData.ammoniaReactor.inlet;
                        const ratio = ammInlet.moles.N2 > 0 ? (ammInlet.moles.H2 / ammInlet.moles.N2) : 0;
                        return ratio.toFixed(3);
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="relative">
                  <StreamTable 
                    title="Ammonia Reactor Inlet" 
                    data={plantData.ammoniaReactor.inlet} 
                    isEditable 
                    onEdit={handleReactorInletEdit} 
                  />
                  {customReactorInlet && (
                    <button 
                      onClick={() => setCustomReactorInlet(null)}
                      className="absolute top-2 right-24 bg-red-500 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded shadow-sm z-10 font-bold uppercase"
                    >
                      Reset to Calculated
                    </button>
                  )}
                </div>
                <StreamTable title="Reactor Outlet" data={plantData.ammoniaReactor.outlet} />
              </div>
            </div>
          )}

          {/* Centralized Action Area */}
          <div className="flex flex-col items-center justify-center space-y-6 pt-12 pb-8">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button 
                onClick={handleSave} 
                className={`px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center space-x-2 ${
                  saveStatus === 'saved' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'
                }`}
              >
                <i className={`fas ${saveStatus === 'saving' ? 'fa-spinner fa-spin' : (saveStatus === 'saved' ? 'fa-check-circle' : 'fa-save')} text-lg`}></i>
                <span>{saveStatus === 'saving' ? 'Saving...' : (saveStatus === 'saved' ? 'Progress Saved!' : 'Save Progress')}</span>
              </button>
              <button 
                onClick={handleDownloadPDF} 
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center space-x-2"
              >
                <i className="fas fa-file-pdf text-lg"></i>
                <span>Download PDF</span>
              </button>
              <button 
                onClick={handleDownloadExcel} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center space-x-2"
              >
                <i className="fas fa-file-excel text-lg"></i>
                <span>Download Excel</span>
              </button>
            </div>
            <div className="text-center">
               {saveStatus === 'saved' && <p className="text-emerald-500 text-[10px] font-bold mt-1 uppercase animate-pulse">Simulation saved to local storage.</p>}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 p-10 mt-12 text-slate-400 text-center text-xs">
        <div className="container mx-auto">
          <p className="text-slate-300 font-semibold mb-2 flex items-center justify-center">
            <i className="fas fa-shield-halved mr-2 text-emerald-500"></i>
            Developed by Muhammad Ans, Process Control Engineer.
          </p>
          <p className="opacity-50 tracking-widest uppercase">&copy; 2026 | All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
