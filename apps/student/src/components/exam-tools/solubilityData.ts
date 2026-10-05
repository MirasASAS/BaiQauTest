export type SolubilityValue = 'R' | 'M' | 'N' | 'D';

export interface SolubilitySubstance {
  formula: string;
  name: { ru: string; kz: string };
  value: SolubilityValue;
}

export interface SolubilityIon {
  id: string;
  label: string;
  name: { ru: string; kz: string };
}

export interface SolubilityAnion extends SolubilityIon {
  values: Record<string, SolubilityValue>;
}

/** Кислоты — все растворимы в воде */
export const solubilityAcids: SolubilitySubstance[] = [
  { formula: 'HCl', name: { ru: 'Соляная кислота', kz: 'Тұз қышқылы' }, value: 'R' },
  { formula: 'HNO₃', name: { ru: 'Азотная кислота', kz: 'Азот қышқылы' }, value: 'R' },
  { formula: 'H₂SO₄', name: { ru: 'Серная кислота', kz: 'Күкірт қышқылы' }, value: 'R' },
  { formula: 'H₂CO₃', name: { ru: 'Угольная кислота', kz: 'Көмір қышқылы' }, value: 'R' },
  { formula: 'H₃PO₄', name: { ru: 'Фосфорная кислота', kz: 'Фосфор қышқылы' }, value: 'R' },
  { formula: 'CH₃COOH', name: { ru: 'Уксусная кислота', kz: 'Оцт қышқылы' }, value: 'R' },
];

/** Основания */
export const solubilityBases: SolubilitySubstance[] = [
  { formula: 'KOH', name: { ru: 'Гидроксид калия', kz: 'Калий гидроксиді' }, value: 'R' },
  { formula: 'NaOH', name: { ru: 'Гидроксид натрия', kz: 'Натрий гидроксиді' }, value: 'R' },
  { formula: 'Ba(OH)₂', name: { ru: 'Гидроксид бария', kz: 'Барий гидроксиді' }, value: 'R' },
  { formula: 'Ca(OH)₂', name: { ru: 'Гидроксид кальция', kz: 'Кальций гидроксиді' }, value: 'M' },
  { formula: 'Mg(OH)₂', name: { ru: 'Гидроксид магния', kz: 'Магний гидроксиді' }, value: 'N' },
  { formula: 'Al(OH)₃', name: { ru: 'Гидроксид алюминия', kz: 'Алюминий гидроксиді' }, value: 'N' },
  { formula: 'Fe(OH)₂', name: { ru: 'Гидроксид железа(II)', kz: 'Темір(II) гидроксиді' }, value: 'N' },
  { formula: 'Fe(OH)₃', name: { ru: 'Гидроксид железа(III)', kz: 'Темір(III) гидроксиді' }, value: 'N' },
  { formula: 'Cu(OH)₂', name: { ru: 'Гидроксид меди', kz: 'Мыс гидроксиді' }, value: 'N' },
  { formula: 'Zn(OH)₂', name: { ru: 'Гидроксид цинка', kz: 'Цинк гидроксиді' }, value: 'N' },
  { formula: 'AgOH', name: { ru: 'Гидроксид серебра', kz: 'Күміс гидроксиді' }, value: 'N' },
  { formula: 'Pb(OH)₂', name: { ru: 'Гидроксид свинца', kz: 'Қорғасын гидроксиді' }, value: 'N' },
];

/** Катионы — столбцы таблицы солей */
export const solubilityCations: SolubilityIon[] = [
  { id: 'K', label: 'K⁺', name: { ru: 'Калий', kz: 'Калий' } },
  { id: 'Na', label: 'Na⁺', name: { ru: 'Натрий', kz: 'Натрий' } },
  { id: 'NH4', label: 'NH₄⁺', name: { ru: 'Аммоний', kz: 'Аммоний' } },
  { id: 'Ca', label: 'Ca²⁺', name: { ru: 'Кальций', kz: 'Кальций' } },
  { id: 'Mg', label: 'Mg²⁺', name: { ru: 'Магний', kz: 'Магний' } },
  { id: 'Ba', label: 'Ba²⁺', name: { ru: 'Барий', kz: 'Барий' } },
  { id: 'Al', label: 'Al³⁺', name: { ru: 'Алюминий', kz: 'Алюминий' } },
  { id: 'Zn', label: 'Zn²⁺', name: { ru: 'Цинк', kz: 'Цинк' } },
  { id: 'Fe2', label: 'Fe²⁺', name: { ru: 'Железо(II)', kz: 'Темір(II)' } },
  { id: 'Fe3', label: 'Fe³⁺', name: { ru: 'Железо(III)', kz: 'Темір(III)' } },
  { id: 'Cu', label: 'Cu²⁺', name: { ru: 'Медь', kz: 'Мыс' } },
  { id: 'Ag', label: 'Ag⁺', name: { ru: 'Серебро', kz: 'Күміс' } },
  { id: 'Pb', label: 'Pb²⁺', name: { ru: 'Свинец', kz: 'Қорғасын' } },
];

/** Анионы — строки таблицы солей. R — растворимая, M — малорастворимая, N — нерастворимая, D — не определено */
export const solubilityAnions: SolubilityAnion[] = [
  {
    id: 'NO3', label: 'NO₃⁻', name: { ru: 'Нитрат', kz: 'Нитрат' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'R', Mg: 'R', Ba: 'R', Al: 'R', Zn: 'R', Fe2: 'R', Fe3: 'R', Cu: 'R', Ag: 'R', Pb: 'R' },
  },
  {
    id: 'Cl', label: 'Cl⁻', name: { ru: 'Хлорид', kz: 'Хлорид' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'R', Mg: 'R', Ba: 'R', Al: 'R', Zn: 'R', Fe2: 'R', Fe3: 'R', Cu: 'R', Ag: 'N', Pb: 'M' },
  },
  {
    id: 'SO4', label: 'SO₄²⁻', name: { ru: 'Сульфат', kz: 'Сульфат' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'M', Mg: 'R', Ba: 'N', Al: 'R', Zn: 'R', Fe2: 'R', Fe3: 'R', Cu: 'R', Ag: 'M', Pb: 'N' },
  },
  {
    id: 'CO3', label: 'CO₃²⁻', name: { ru: 'Карбонат', kz: 'Карбонат' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'N', Mg: 'N', Ba: 'N', Al: 'D', Zn: 'N', Fe2: 'N', Fe3: 'D', Cu: 'N', Ag: 'N', Pb: 'N' },
  },
  {
    id: 'PO4', label: 'PO₄³⁻', name: { ru: 'Фосфат', kz: 'Фосфат' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'N', Mg: 'N', Ba: 'N', Al: 'N', Zn: 'N', Fe2: 'N', Fe3: 'N', Cu: 'N', Ag: 'N', Pb: 'N' },
  },
  {
    id: 'OH', label: 'OH⁻', name: { ru: 'Гидроксид', kz: 'Гидроксид' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'M', Mg: 'N', Ba: 'R', Al: 'N', Zn: 'N', Fe2: 'N', Fe3: 'N', Cu: 'N', Ag: 'N', Pb: 'N' },
  },
  {
    id: 'S', label: 'S²⁻', name: { ru: 'Сульфид', kz: 'Сульфид' },
    values: { K: 'R', Na: 'R', NH4: 'R', Ca: 'D', Mg: 'D', Ba: 'D', Al: 'D', Zn: 'N', Fe2: 'N', Fe3: 'D', Cu: 'N', Ag: 'N', Pb: 'N' },
  },
];
