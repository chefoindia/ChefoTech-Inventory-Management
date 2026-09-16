import { z } from 'zod';
import type { DrugSchedule } from '../schemas/product';

/**
 * A starter catalogue of medicines and counter items that most Indian retail pharmacies stock, so a
 * new owner does not have to type their first hundred products by hand.
 *
 * What this data is: brand, composition, manufacturer, dosage form and a typical pack size, plus the
 * unit structure the platform needs (base unit, pack unit, how many base units per pack).
 *
 * What it is NOT: prices. MRP, selling and purchase prices differ by batch and supplier, so every
 * product is created with zero prices and the real numbers arrive with the first purchase or a
 * manual edit. Pack sizes, GST rates and schedules are the common case and must be checked against
 * the pack and the supplier's invoice, which the screen says in as many words.
 */

export const STARTER_CATEGORIES = [
  'Pain & fever',
  'Antibiotics',
  'Stomach & digestion',
  'Cold, cough & allergy',
  'Diabetes',
  'Heart & blood pressure',
  'Vitamins & supplements',
  'Skin & topical',
  'Baby & child care',
  'First aid, devices & general',
] as const;
export type StarterCategory = (typeof STARTER_CATEGORIES)[number];

export interface StarterMedicine {
  /** Stable id used when the owner picks items; never shown. */
  key: string;
  name: string;
  brandName: string;
  genericName: string;
  composition: string;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  packLabel: string;
  /** Smallest sellable unit; must be one of the platform's default unit names. */
  baseUnit: string;
  /** Pack the product is normally priced and purchased in. Null when the base unit is the pack. */
  packUnit: string | null;
  /** How many base units are in one pack unit. */
  packSize: number;
  hsnCode: string;
  gstRateBps: number;
  schedule: DrugSchedule;
  requiresPrescription: boolean;
  category: StarterCategory;
  /** Part of the smallest sensible opening catalogue, pre-ticked for a brand-new pharmacy. */
  essential: boolean;
}

interface Row {
  key: string;
  name: string;
  brand: string;
  generic: string;
  composition: string;
  maker: string;
  category: StarterCategory;
  form?: string;
  strength?: string;
  pack?: string;
  base?: string;
  packUnit?: string | null;
  size?: number;
  gst?: number;
  hsn?: string;
  schedule?: DrugSchedule;
  rx?: boolean;
  essential?: boolean;
}

const row = (r: Row): StarterMedicine => ({
  key: r.key,
  name: r.name,
  brandName: r.brand,
  genericName: r.generic,
  composition: r.composition,
  manufacturer: r.maker,
  dosageForm: r.form ?? 'tablet',
  strength: r.strength ?? '',
  packLabel: r.pack ?? '1x10',
  baseUnit: r.base ?? 'Tablet',
  packUnit: r.packUnit === undefined ? 'Strip' : r.packUnit,
  packSize: r.size ?? 10,
  hsnCode: r.hsn ?? '3004',
  gstRateBps: r.gst ?? 1200,
  schedule: r.schedule ?? 'none',
  requiresPrescription: r.rx ?? (r.schedule ? r.schedule !== 'none' && r.schedule !== 'OTC' : false),
  category: r.category,
  essential: r.essential ?? false,
});

const ROWS: Row[] = [
  /* ------------------------------------------------------------ pain & fever */
  { key: 'dolo-650', name: 'Dolo 650 Tablet', brand: 'Dolo', generic: 'Paracetamol', composition: 'Paracetamol 650 mg', maker: 'Micro Labs', strength: '650 mg', pack: '1x15', size: 15, category: 'Pain & fever', essential: true },
  { key: 'crocin-advance', name: 'Crocin Advance Tablet', brand: 'Crocin', generic: 'Paracetamol', composition: 'Paracetamol 500 mg', maker: 'GSK', strength: '500 mg', pack: '1x15', size: 15, category: 'Pain & fever', essential: true },
  { key: 'calpol-500', name: 'Calpol 500 Tablet', brand: 'Calpol', generic: 'Paracetamol', composition: 'Paracetamol 500 mg', maker: 'GSK', strength: '500 mg', pack: '1x15', size: 15, category: 'Pain & fever' },
  { key: 'combiflam', name: 'Combiflam Tablet', brand: 'Combiflam', generic: 'Ibuprofen + Paracetamol', composition: 'Ibuprofen 400 mg + Paracetamol 325 mg', maker: 'Sanofi', pack: '1x20', size: 20, category: 'Pain & fever', essential: true },
  { key: 'brufen-400', name: 'Brufen 400 Tablet', brand: 'Brufen', generic: 'Ibuprofen', composition: 'Ibuprofen 400 mg', maker: 'Abbott', strength: '400 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Pain & fever' },
  { key: 'zerodol-sp', name: 'Zerodol SP Tablet', brand: 'Zerodol', generic: 'Aceclofenac + Paracetamol + Serratiopeptidase', composition: 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 15 mg', maker: 'Ipca Laboratories', schedule: 'H', category: 'Pain & fever', essential: true },
  { key: 'zerodol-p', name: 'Zerodol P Tablet', brand: 'Zerodol', generic: 'Aceclofenac + Paracetamol', composition: 'Aceclofenac 100 mg + Paracetamol 325 mg', maker: 'Ipca Laboratories', schedule: 'H', category: 'Pain & fever' },
  { key: 'meftal-spas', name: 'Meftal Spas Tablet', brand: 'Meftal', generic: 'Dicyclomine + Mefenamic acid', composition: 'Dicyclomine 20 mg + Mefenamic acid 250 mg', maker: 'Blue Cross Laboratories', schedule: 'H', category: 'Pain & fever', essential: true },
  { key: 'voveran-sr-100', name: 'Voveran SR 100 Tablet', brand: 'Voveran', generic: 'Diclofenac sodium', composition: 'Diclofenac sodium 100 mg (sustained release)', maker: 'Novartis', strength: '100 mg', schedule: 'H', category: 'Pain & fever' },
  { key: 'saridon', name: 'Saridon Tablet', brand: 'Saridon', generic: 'Paracetamol + Propyphenazone + Caffeine', composition: 'Paracetamol 250 mg + Propyphenazone 150 mg + Caffeine 50 mg', maker: 'Piramal', schedule: 'OTC', category: 'Pain & fever' },
  { key: 'disprin', name: 'Disprin Tablet', brand: 'Disprin', generic: 'Aspirin', composition: 'Aspirin 325 mg', maker: 'Reckitt', strength: '325 mg', schedule: 'OTC', category: 'Pain & fever' },
  { key: 'volini-gel', name: 'Volini Pain Relief Gel 30 g', brand: 'Volini', generic: 'Diclofenac diethylamine', composition: 'Diclofenac diethylamine topical gel', maker: 'Sun Pharma', form: 'gel', pack: '30 g', base: 'Gram', packUnit: 'Tube', size: 30, category: 'Pain & fever', essential: true },
  { key: 'iodex-balm', name: 'Iodex Balm 40 g', brand: 'Iodex', generic: 'Methyl salicylate + Menthol', composition: 'Methyl salicylate + Menthol topical balm', maker: 'GSK', form: 'ointment', pack: '40 g', base: 'Gram', packUnit: 'Tube', size: 40, category: 'Pain & fever' },

  /* ------------------------------------------------------------ antibiotics */
  { key: 'augmentin-625', name: 'Augmentin 625 Duo Tablet', brand: 'Augmentin', generic: 'Amoxicillin + Clavulanic acid', composition: 'Amoxicillin 500 mg + Clavulanic acid 125 mg', maker: 'GSK', schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'azithral-500', name: 'Azithral 500 Tablet', brand: 'Azithral', generic: 'Azithromycin', composition: 'Azithromycin 500 mg', maker: 'Alembic', strength: '500 mg', pack: '1x5', size: 5, schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'azee-500', name: 'Azee 500 Tablet', brand: 'Azee', generic: 'Azithromycin', composition: 'Azithromycin 500 mg', maker: 'Cipla', strength: '500 mg', pack: '1x3', size: 3, schedule: 'H', category: 'Antibiotics' },
  { key: 'novamox-500', name: 'Novamox 500 Capsule', brand: 'Novamox', generic: 'Amoxicillin', composition: 'Amoxicillin 500 mg', maker: 'Cipla', form: 'capsule', strength: '500 mg', base: 'Capsule', schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'taxim-o-200', name: 'Taxim-O 200 Tablet', brand: 'Taxim-O', generic: 'Cefixime', composition: 'Cefixime 200 mg', maker: 'Alkem', strength: '200 mg', schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'zifi-200', name: 'Zifi 200 Tablet', brand: 'Zifi', generic: 'Cefixime', composition: 'Cefixime 200 mg', maker: 'FDC', strength: '200 mg', schedule: 'H', category: 'Antibiotics' },
  { key: 'ciplox-500', name: 'Ciplox 500 Tablet', brand: 'Ciplox', generic: 'Ciprofloxacin', composition: 'Ciprofloxacin 500 mg', maker: 'Cipla', strength: '500 mg', schedule: 'H', category: 'Antibiotics' },
  { key: 'levoflox-500', name: 'Levoflox 500 Tablet', brand: 'Levoflox', generic: 'Levofloxacin', composition: 'Levofloxacin 500 mg', maker: 'Cipla', strength: '500 mg', pack: '1x5', size: 5, schedule: 'H', category: 'Antibiotics' },
  { key: 'metrogyl-400', name: 'Metrogyl 400 Tablet', brand: 'Metrogyl', generic: 'Metronidazole', composition: 'Metronidazole 400 mg', maker: 'J.B. Chemicals', strength: '400 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'o2-tablet', name: 'O2 Tablet', brand: 'O2', generic: 'Ofloxacin + Ornidazole', composition: 'Ofloxacin 200 mg + Ornidazole 500 mg', maker: 'FDC', schedule: 'H', category: 'Antibiotics', essential: true },
  { key: 'doxy-1-ldr', name: 'Doxy-1 L-DR Capsule', brand: 'Doxy-1', generic: 'Doxycycline + Lactic acid bacillus', composition: 'Doxycycline 100 mg + Lactic acid bacillus', maker: 'USV', form: 'capsule', base: 'Capsule', schedule: 'H', category: 'Antibiotics' },

  /* ------------------------------------------------------------ stomach */
  { key: 'pan-40', name: 'Pan 40 Tablet', brand: 'Pan', generic: 'Pantoprazole', composition: 'Pantoprazole 40 mg', maker: 'Alkem', strength: '40 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Stomach & digestion', essential: true },
  { key: 'pan-d', name: 'Pan-D Capsule', brand: 'Pan', generic: 'Pantoprazole + Domperidone', composition: 'Pantoprazole 40 mg + Domperidone 30 mg (sustained release)', maker: 'Alkem', form: 'capsule', base: 'Capsule', pack: '1x15', size: 15, schedule: 'H', category: 'Stomach & digestion', essential: true },
  { key: 'omez-20', name: 'Omez 20 Capsule', brand: 'Omez', generic: 'Omeprazole', composition: 'Omeprazole 20 mg', maker: "Dr. Reddy's", form: 'capsule', base: 'Capsule', strength: '20 mg', schedule: 'H', category: 'Stomach & digestion' },
  { key: 'digene-tablet', name: 'Digene Antacid Tablet', brand: 'Digene', generic: 'Antacid', composition: 'Magnesium hydroxide + Aluminium hydroxide + Simethicone', maker: 'Abbott', pack: '1x15', size: 15, schedule: 'OTC', category: 'Stomach & digestion', essential: true },
  { key: 'gelusil-mps', name: 'Gelusil MPS Suspension 200 ml', brand: 'Gelusil', generic: 'Antacid suspension', composition: 'Magnesium hydroxide + Aluminium hydroxide + Simethicone', maker: 'Pfizer', form: 'suspension', pack: '200 ml', base: 'Millilitre', packUnit: 'Bottle', size: 200, schedule: 'OTC', category: 'Stomach & digestion' },
  { key: 'eno-sachet', name: 'Eno Fruit Salt Sachet 5 g', brand: 'Eno', generic: 'Antacid powder', composition: 'Sodium bicarbonate + Citric acid + Sodium carbonate', maker: 'GSK', form: 'powder', pack: '5 g sachet', base: 'Sachet', packUnit: null, size: 1, schedule: 'OTC', category: 'Stomach & digestion', essential: true },
  { key: 'ondem-4', name: 'Ondem 4 Tablet', brand: 'Ondem', generic: 'Ondansetron', composition: 'Ondansetron 4 mg', maker: 'Alkem', strength: '4 mg', schedule: 'H', category: 'Stomach & digestion', essential: true },
  { key: 'domstal-10', name: 'Domstal 10 Tablet', brand: 'Domstal', generic: 'Domperidone', composition: 'Domperidone 10 mg', maker: 'Torrent', strength: '10 mg', schedule: 'H', category: 'Stomach & digestion' },
  { key: 'cyclopam', name: 'Cyclopam Tablet', brand: 'Cyclopam', generic: 'Dicyclomine + Paracetamol', composition: 'Dicyclomine 20 mg + Paracetamol 500 mg', maker: 'Indoco Remedies', schedule: 'H', category: 'Stomach & digestion' },
  { key: 'econorm-sachet', name: 'Econorm Sachet 1 g', brand: 'Econorm', generic: 'Saccharomyces boulardii', composition: 'Saccharomyces boulardii 250 mg', maker: "Dr. Reddy's", form: 'sachet', pack: '1 g sachet', base: 'Sachet', packUnit: null, size: 1, category: 'Stomach & digestion', essential: true },
  { key: 'sporlac-ds', name: 'Sporlac DS Tablet', brand: 'Sporlac', generic: 'Lactic acid bacillus', composition: 'Lactic acid bacillus 120 million spores', maker: 'Sanzyme', category: 'Stomach & digestion' },
  { key: 'duphalac-200', name: 'Duphalac Syrup 200 ml', brand: 'Duphalac', generic: 'Lactulose', composition: 'Lactulose 10 g/15 ml', maker: 'Abbott', form: 'syrup', pack: '200 ml', base: 'Millilitre', packUnit: 'Bottle', size: 200, category: 'Stomach & digestion' },
  { key: 'cremaffin', name: 'Cremaffin Syrup 225 ml', brand: 'Cremaffin', generic: 'Laxative', composition: 'Milk of magnesia + Liquid paraffin', maker: 'Abbott', form: 'syrup', pack: '225 ml', base: 'Millilitre', packUnit: 'Bottle', size: 225, schedule: 'OTC', category: 'Stomach & digestion' },
  { key: 'unienzyme', name: 'Unienzyme Tablet', brand: 'Unienzyme', generic: 'Digestive enzymes', composition: 'Fungal diastase + Papain + Activated charcoal', maker: 'Torrent', pack: '1x15', size: 15, schedule: 'OTC', category: 'Stomach & digestion' },
  { key: 'electral-powder', name: 'Electral Powder Sachet 21.8 g', brand: 'Electral', generic: 'Oral rehydration salts', composition: 'WHO-formula oral rehydration salts', maker: 'FDC', form: 'powder', pack: '21.8 g sachet', base: 'Sachet', packUnit: null, size: 1, gst: 500, schedule: 'OTC', category: 'Stomach & digestion', essential: true },

  /* ------------------------------------------------------------ cold, cough & allergy */
  { key: 'cetzine-10', name: 'Cetzine 10 Tablet', brand: 'Cetzine', generic: 'Cetirizine', composition: 'Cetirizine 10 mg', maker: 'GSK', strength: '10 mg', category: 'Cold, cough & allergy', essential: true },
  { key: 'alerid-10', name: 'Alerid 10 Tablet', brand: 'Alerid', generic: 'Cetirizine', composition: 'Cetirizine 10 mg', maker: 'Cipla', strength: '10 mg', category: 'Cold, cough & allergy' },
  { key: 'montek-lc', name: 'Montek LC Tablet', brand: 'Montek', generic: 'Montelukast + Levocetirizine', composition: 'Montelukast 10 mg + Levocetirizine 5 mg', maker: 'Sun Pharma', schedule: 'H', category: 'Cold, cough & allergy', essential: true },
  { key: 'teczine-5', name: 'Teczine 5 Tablet', brand: 'Teczine', generic: 'Levocetirizine', composition: 'Levocetirizine 5 mg', maker: 'Ajanta Pharma', strength: '5 mg', category: 'Cold, cough & allergy' },
  { key: 'allegra-120', name: 'Allegra 120 Tablet', brand: 'Allegra', generic: 'Fexofenadine', composition: 'Fexofenadine 120 mg', maker: 'Sanofi', strength: '120 mg', schedule: 'H', category: 'Cold, cough & allergy', essential: true },
  { key: 'sinarest', name: 'Sinarest Tablet', brand: 'Sinarest', generic: 'Paracetamol + Phenylephrine + Chlorpheniramine', composition: 'Paracetamol 500 mg + Phenylephrine 10 mg + Chlorpheniramine 2 mg', maker: 'Centaur Pharmaceuticals', category: 'Cold, cough & allergy', essential: true },
  { key: 'cheston-cold', name: 'Cheston Cold Tablet', brand: 'Cheston', generic: 'Cetirizine + Phenylephrine + Paracetamol', composition: 'Cetirizine 5 mg + Phenylephrine 10 mg + Paracetamol 325 mg', maker: 'Cipla', category: 'Cold, cough & allergy' },
  { key: 'ascoril-ls', name: 'Ascoril LS Syrup 100 ml', brand: 'Ascoril', generic: 'Ambroxol + Levosalbutamol + Guaifenesin', composition: 'Ambroxol 30 mg + Levosalbutamol 1 mg + Guaifenesin 50 mg per 10 ml', maker: 'Glenmark', form: 'syrup', pack: '100 ml', base: 'Millilitre', packUnit: 'Bottle', size: 100, schedule: 'H', category: 'Cold, cough & allergy', essential: true },
  { key: 'benadryl-syrup', name: 'Benadryl Cough Formula Syrup 100 ml', brand: 'Benadryl', generic: 'Diphenhydramine + Ammonium chloride', composition: 'Diphenhydramine 14 mg + Ammonium chloride 138 mg + Sodium citrate 57 mg per 5 ml', maker: 'Johnson & Johnson', form: 'syrup', pack: '100 ml', base: 'Millilitre', packUnit: 'Bottle', size: 100, category: 'Cold, cough & allergy', essential: true },
  { key: 'honitus-syrup', name: 'Honitus Cough Syrup 100 ml', brand: 'Honitus', generic: 'Ayurvedic cough syrup', composition: 'Ayurvedic herbal cough syrup with honey and tulsi', maker: 'Dabur', form: 'syrup', pack: '100 ml', base: 'Millilitre', packUnit: 'Bottle', size: 100, schedule: 'OTC', category: 'Cold, cough & allergy' },
  { key: 'otrivin-spray', name: 'Otrivin Nasal Spray 10 ml', brand: 'Otrivin', generic: 'Xylometazoline', composition: 'Xylometazoline 0.1% w/v nasal spray', maker: 'GSK', form: 'spray', pack: '10 ml', base: 'Millilitre', packUnit: 'Bottle', size: 10, schedule: 'OTC', category: 'Cold, cough & allergy', essential: true },
  { key: 'vicks-vaporub', name: 'Vicks VapoRub 50 g', brand: 'Vicks', generic: 'Camphor + Menthol + Eucalyptus oil', composition: 'Camphor + Menthol + Eucalyptus oil + Turpentine oil', maker: 'Procter & Gamble', form: 'ointment', pack: '50 g', base: 'Gram', packUnit: 'Tube', size: 50, schedule: 'OTC', category: 'Cold, cough & allergy', essential: true },
  { key: 'strepsils-lozenge', name: 'Strepsils Lozenges', brand: 'Strepsils', generic: 'Amylmetacresol + Dichlorobenzyl alcohol', composition: 'Amylmetacresol 0.6 mg + 2,4-Dichlorobenzyl alcohol 1.2 mg', maker: 'Reckitt', form: 'other', pack: '1x8', base: 'Piece', size: 8, schedule: 'OTC', category: 'Cold, cough & allergy' },

  /* ------------------------------------------------------------ diabetes */
  { key: 'glycomet-500', name: 'Glycomet 500 Tablet', brand: 'Glycomet', generic: 'Metformin', composition: 'Metformin hydrochloride 500 mg', maker: 'USV', strength: '500 mg', pack: '1x20', size: 20, schedule: 'H', category: 'Diabetes', essential: true },
  { key: 'glycomet-gp1', name: 'Glycomet GP 1 Tablet', brand: 'Glycomet', generic: 'Glimepiride + Metformin', composition: 'Glimepiride 1 mg + Metformin 500 mg', maker: 'USV', pack: '1x15', size: 15, schedule: 'H', category: 'Diabetes' },
  { key: 'amaryl-1', name: 'Amaryl 1 Tablet', brand: 'Amaryl', generic: 'Glimepiride', composition: 'Glimepiride 1 mg', maker: 'Sanofi', strength: '1 mg', schedule: 'H', category: 'Diabetes' },
  { key: 'accu-chek-strips', name: 'Accu-Chek Active Test Strips (50)', brand: 'Accu-Chek', generic: 'Blood glucose test strips', composition: 'Blood glucose test strips, 50 per box', maker: 'Roche', form: 'device', pack: '50 strips', base: 'Piece', packUnit: 'Box', size: 50, hsn: '3822', category: 'Diabetes', essential: true },
  { key: 'accu-chek-meter', name: 'Accu-Chek Active Glucometer', brand: 'Accu-Chek', generic: 'Blood glucose meter', composition: 'Blood glucose monitoring device', maker: 'Roche', form: 'device', pack: '1 unit', base: 'Piece', packUnit: null, size: 1, hsn: '9027', category: 'Diabetes' },

  /* ------------------------------------------------------------ heart & BP */
  { key: 'telma-40', name: 'Telma 40 Tablet', brand: 'Telma', generic: 'Telmisartan', composition: 'Telmisartan 40 mg', maker: 'Glenmark', strength: '40 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure', essential: true },
  { key: 'telma-h', name: 'Telma-H Tablet', brand: 'Telma', generic: 'Telmisartan + Hydrochlorothiazide', composition: 'Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg', maker: 'Glenmark', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure' },
  { key: 'amlopres-5', name: 'Amlopres 5 Tablet', brand: 'Amlopres', generic: 'Amlodipine', composition: 'Amlodipine 5 mg', maker: 'Cipla', strength: '5 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure', essential: true },
  { key: 'aten-50', name: 'Aten 50 Tablet', brand: 'Aten', generic: 'Atenolol', composition: 'Atenolol 50 mg', maker: 'Zydus', strength: '50 mg', pack: '1x14', size: 14, schedule: 'H', category: 'Heart & blood pressure' },
  { key: 'met-xl-25', name: 'Met XL 25 Tablet', brand: 'Met XL', generic: 'Metoprolol succinate', composition: 'Metoprolol succinate 25 mg (extended release)', maker: 'Ajanta Pharma', strength: '25 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure' },
  { key: 'ecosprin-75', name: 'Ecosprin 75 Tablet', brand: 'Ecosprin', generic: 'Aspirin', composition: 'Aspirin 75 mg', maker: 'USV', strength: '75 mg', pack: '1x14', size: 14, schedule: 'H', category: 'Heart & blood pressure', essential: true },
  { key: 'rosuvas-10', name: 'Rosuvas 10 Tablet', brand: 'Rosuvas', generic: 'Rosuvastatin', composition: 'Rosuvastatin 10 mg', maker: 'Sun Pharma', strength: '10 mg', schedule: 'H', category: 'Heart & blood pressure' },
  { key: 'atorva-10', name: 'Atorva 10 Tablet', brand: 'Atorva', generic: 'Atorvastatin', composition: 'Atorvastatin 10 mg', maker: 'Zydus', strength: '10 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure', essential: true },
  { key: 'clopitab-75', name: 'Clopitab 75 Tablet', brand: 'Clopitab', generic: 'Clopidogrel', composition: 'Clopidogrel 75 mg', maker: 'Ipca Laboratories', strength: '75 mg', pack: '1x15', size: 15, schedule: 'H', category: 'Heart & blood pressure' },

  /* ------------------------------------------------------------ vitamins */
  { key: 'shelcal-500', name: 'Shelcal 500 Tablet', brand: 'Shelcal', generic: 'Calcium + Vitamin D3', composition: 'Calcium carbonate 500 mg + Vitamin D3 250 IU', maker: 'Torrent', pack: '1x15', size: 15, category: 'Vitamins & supplements', essential: true },
  { key: 'neurobion-forte', name: 'Neurobion Forte Tablet', brand: 'Neurobion', generic: 'Vitamin B complex', composition: 'Vitamin B1, B2, B6, B12, Niacinamide, D-Panthenol', maker: 'P&G Health', pack: '1x30', size: 30, category: 'Vitamins & supplements', essential: true },
  { key: 'becosules', name: 'Becosules Capsule', brand: 'Becosules', generic: 'Vitamin B complex + Vitamin C', composition: 'B-complex vitamins with Vitamin C 150 mg', maker: 'Pfizer', form: 'capsule', base: 'Capsule', pack: '1x20', size: 20, category: 'Vitamins & supplements', essential: true },
  { key: 'zincovit', name: 'Zincovit Tablet', brand: 'Zincovit', generic: 'Multivitamin + Zinc', composition: 'Multivitamins, multiminerals and zinc', maker: 'Apex Laboratories', pack: '1x15', size: 15, category: 'Vitamins & supplements', essential: true },
  { key: 'limcee-500', name: 'Limcee 500 Chewable Tablet', brand: 'Limcee', generic: 'Vitamin C', composition: 'Ascorbic acid 500 mg', maker: 'Abbott', strength: '500 mg', pack: '1x15', size: 15, category: 'Vitamins & supplements' },
  { key: 'a-to-z-ns', name: 'A to Z NS Tablet', brand: 'A to Z', generic: 'Multivitamin', composition: 'Multivitamins with minerals and antioxidants', maker: 'Alkem', pack: '1x15', size: 15, category: 'Vitamins & supplements' },
  { key: 'supradyn', name: 'Supradyn Daily Tablet', brand: 'Supradyn', generic: 'Multivitamin', composition: 'Multivitamins and minerals', maker: 'Bayer', pack: '1x15', size: 15, category: 'Vitamins & supplements' },
  { key: 'uprise-d3-60k', name: 'Uprise D3 60K Capsule', brand: 'Uprise', generic: 'Cholecalciferol', composition: 'Cholecalciferol (Vitamin D3) 60000 IU', maker: 'Alkem', form: 'capsule', base: 'Capsule', pack: '1x4', size: 4, category: 'Vitamins & supplements', essential: true },
  { key: 'livogen', name: 'Livogen Tablet', brand: 'Livogen', generic: 'Iron + Folic acid', composition: 'Ferrous fumarate 152 mg + Folic acid 1.5 mg', maker: 'P&G Health', pack: '1x30', size: 30, category: 'Vitamins & supplements' },
  { key: 'protinex-250', name: 'Protinex Powder 250 g', brand: 'Protinex', generic: 'Protein supplement', composition: 'High-protein nutritional powder', maker: 'Danone', form: 'powder', pack: '250 g', base: 'Gram', packUnit: 'Pack', size: 250, gst: 1800, hsn: '2106', category: 'Vitamins & supplements' },

  /* ------------------------------------------------------------ skin & topical */
  { key: 'candid-cream', name: 'Candid Cream 15 g', brand: 'Candid', generic: 'Clotrimazole', composition: 'Clotrimazole 1% w/w cream', maker: 'Glenmark', form: 'cream', pack: '15 g', base: 'Gram', packUnit: 'Tube', size: 15, category: 'Skin & topical', essential: true },
  { key: 'candid-powder', name: 'Candid Dusting Powder 100 g', brand: 'Candid', generic: 'Clotrimazole', composition: 'Clotrimazole 1% w/w dusting powder', maker: 'Glenmark', form: 'powder', pack: '100 g', base: 'Gram', packUnit: 'Bottle', size: 100, category: 'Skin & topical' },
  { key: 'betnovate-n', name: 'Betnovate-N Cream 20 g', brand: 'Betnovate', generic: 'Betamethasone + Neomycin', composition: 'Betamethasone valerate 0.1% + Neomycin 0.5%', maker: 'GSK', form: 'cream', pack: '20 g', base: 'Gram', packUnit: 'Tube', size: 20, schedule: 'H', category: 'Skin & topical', essential: true },
  { key: 'soframycin-cream', name: 'Soframycin Skin Cream 30 g', brand: 'Soframycin', generic: 'Framycetin', composition: 'Framycetin sulphate 1% w/w', maker: 'Sanofi', form: 'cream', pack: '30 g', base: 'Gram', packUnit: 'Tube', size: 30, schedule: 'H', category: 'Skin & topical', essential: true },
  { key: 'neosporin-powder', name: 'Neosporin Powder 10 g', brand: 'Neosporin', generic: 'Neomycin + Bacitracin + Polymyxin B', composition: 'Neomycin + Bacitracin + Polymyxin B dusting powder', maker: 'GSK', form: 'powder', pack: '10 g', base: 'Gram', packUnit: 'Bottle', size: 10, schedule: 'H', category: 'Skin & topical' },
  { key: 'tenovate-cream', name: 'Tenovate Cream 15 g', brand: 'Tenovate', generic: 'Clobetasol', composition: 'Clobetasol propionate 0.05% w/w', maker: 'GSK', form: 'cream', pack: '15 g', base: 'Gram', packUnit: 'Tube', size: 15, schedule: 'H', category: 'Skin & topical' },
  { key: 'dettol-liquid', name: 'Dettol Antiseptic Liquid 100 ml', brand: 'Dettol', generic: 'Chloroxylenol', composition: 'Chloroxylenol 4.8% w/v', maker: 'Reckitt', form: 'solution', pack: '100 ml', base: 'Millilitre', packUnit: 'Bottle', size: 100, gst: 1800, hsn: '3808', schedule: 'OTC', category: 'Skin & topical', essential: true },
  { key: 'savlon-liquid', name: 'Savlon Antiseptic Liquid 100 ml', brand: 'Savlon', generic: 'Cetrimide + Chlorhexidine', composition: 'Cetrimide 3% + Chlorhexidine gluconate 1.5%', maker: 'ITC', form: 'solution', pack: '100 ml', base: 'Millilitre', packUnit: 'Bottle', size: 100, gst: 1800, hsn: '3808', schedule: 'OTC', category: 'Skin & topical' },

  /* ------------------------------------------------------------ baby & child */
  { key: 'calpol-250-susp', name: 'Calpol 250 Suspension 60 ml', brand: 'Calpol', generic: 'Paracetamol', composition: 'Paracetamol 250 mg/5 ml', maker: 'GSK', form: 'suspension', pack: '60 ml', base: 'Millilitre', packUnit: 'Bottle', size: 60, category: 'Baby & child care', essential: true },
  { key: 'crocin-drops', name: 'Crocin 100 mg Drops 15 ml', brand: 'Crocin', generic: 'Paracetamol', composition: 'Paracetamol 100 mg/ml oral drops', maker: 'GSK', form: 'drops', pack: '15 ml', base: 'Millilitre', packUnit: 'Bottle', size: 15, category: 'Baby & child care', essential: true },
  { key: 'meftal-p-susp', name: 'Meftal-P Suspension 60 ml', brand: 'Meftal', generic: 'Mefenamic acid', composition: 'Mefenamic acid 50 mg/5 ml', maker: 'Blue Cross Laboratories', form: 'suspension', pack: '60 ml', base: 'Millilitre', packUnit: 'Bottle', size: 60, schedule: 'H', category: 'Baby & child care' },
  { key: 'colicaid-drops', name: 'Colicaid Drops 15 ml', brand: 'Colicaid', generic: 'Simethicone + Dill oil + Fennel', composition: 'Simethicone 40 mg + Dill oil 0.005 ml + Fennel oil 0.0007 ml per ml', maker: 'Mankind', form: 'drops', pack: '15 ml', base: 'Millilitre', packUnit: 'Bottle', size: 15, category: 'Baby & child care' },
  { key: 'zincovit-syrup', name: 'Zincovit Syrup 200 ml', brand: 'Zincovit', generic: 'Multivitamin + Zinc', composition: 'Multivitamins with zinc, paediatric syrup', maker: 'Apex Laboratories', form: 'syrup', pack: '200 ml', base: 'Millilitre', packUnit: 'Bottle', size: 200, category: 'Baby & child care' },

  /* ------------------------------------------------------------ first aid, devices & general */
  { key: 'thermometer-digital', name: 'Digital Thermometer', brand: 'Dr. Morepen', generic: 'Clinical thermometer', composition: 'Digital clinical thermometer', maker: 'Morepen Laboratories', form: 'device', pack: '1 unit', base: 'Piece', packUnit: null, size: 1, hsn: '9025', category: 'First aid, devices & general', essential: true },
  { key: 'bp-monitor', name: 'Omron HEM-7120 BP Monitor', brand: 'Omron', generic: 'Blood pressure monitor', composition: 'Automatic upper-arm blood pressure monitor', maker: 'Omron Healthcare', form: 'device', pack: '1 unit', base: 'Piece', packUnit: null, size: 1, hsn: '9018', category: 'First aid, devices & general' },
  { key: 'cotton-roll', name: 'Absorbent Cotton Roll 50 g', brand: 'Generic', generic: 'Absorbent cotton', composition: 'Sterilised absorbent cotton wool', maker: 'Generic', form: 'other', pack: '50 g', base: 'Piece', packUnit: null, size: 1, hsn: '3005', category: 'First aid, devices & general', essential: true },
  { key: 'hansaplast-strips', name: 'Hansaplast Washproof Strips (10)', brand: 'Hansaplast', generic: 'Adhesive bandage', composition: 'Washproof adhesive wound strips', maker: 'Beiersdorf', form: 'other', pack: '1x10', base: 'Piece', packUnit: 'Pack', size: 10, hsn: '3005', category: 'First aid, devices & general', essential: true },
  { key: 'crepe-bandage', name: 'Crepe Bandage 6 cm', brand: 'Generic', generic: 'Crepe bandage', composition: 'Elastic crepe bandage, 6 cm x 4 m', maker: 'Generic', form: 'other', pack: '1 unit', base: 'Piece', packUnit: null, size: 1, hsn: '3005', category: 'First aid, devices & general' },
  { key: 'surgical-mask', name: '3-Ply Surgical Face Mask', brand: 'Generic', generic: 'Face mask', composition: 'Disposable 3-ply surgical face mask', maker: 'Generic', form: 'other', pack: '1 piece', base: 'Piece', packUnit: 'Box', size: 50, gst: 500, hsn: '6307', category: 'First aid, devices & general' },
  { key: 'dispo-van-5ml', name: 'Dispo Van Syringe 5 ml', brand: 'Dispo Van', generic: 'Disposable syringe', composition: 'Sterile disposable syringe with needle, 5 ml', maker: 'Hindustan Syringes', form: 'device', pack: '1 piece', base: 'Piece', packUnit: 'Box', size: 100, hsn: '9018', category: 'First aid, devices & general' },
  { key: 'hand-sanitizer', name: 'Hand Sanitizer 500 ml', brand: 'Generic', generic: 'Alcohol-based hand rub', composition: 'Ethyl alcohol 70% v/v hand rub', maker: 'Generic', form: 'solution', pack: '500 ml', base: 'Millilitre', packUnit: 'Bottle', size: 500, gst: 1800, hsn: '3808', category: 'First aid, devices & general' },
  { key: 'glucon-d', name: 'Glucon-D Original 450 g', brand: 'Glucon-D', generic: 'Dextrose powder', composition: 'Dextrose monohydrate with vitamin C', maker: 'Zydus Wellness', form: 'powder', pack: '450 g', base: 'Gram', packUnit: 'Pack', size: 450, gst: 1800, hsn: '1702', schedule: 'OTC', category: 'First aid, devices & general' },
];

export const STARTER_MEDICINES: StarterMedicine[] = ROWS.map(row);

export const starterMedicineByKey = (key: string): StarterMedicine | undefined => STARTER_MEDICINES.find((m) => m.key === key);

/** One catalogue entry plus whether this organization already has a product with that name. */
export interface StarterCatalogueItem extends StarterMedicine {
  alreadyAdded: boolean;
}

export const addStarterProductsSchema = z.object({
  keys: z.array(z.string().trim().min(1).max(60)).min(1).max(400),
});
export type AddStarterProductsInput = z.infer<typeof addStarterProductsSchema>;

export interface AddStarterProductsResult {
  added: number;
  /** Names that already existed in the catalogue and were left untouched. */
  skipped: string[];
  /** Items that could not be created, with the reason (plan limit, for example). */
  failed: { name: string; reason: string }[];
}
