'use client';

import { useDeferredValue, useMemo } from 'react';
import { designElectrical } from './electrical.js';
import { buildYieldModel, computeFinancials, computeGst } from './energy.js';
import { normalizeCatalog } from './catalog.js';
import { buildDesign, resolveAzimuth } from './model.js';
import { shadingLoss } from './shading.js';
import { useStore } from './store.js';
import { computeStructure } from './structure.js';

export function useDesign() {
  const sections = useStore((s) => s.sections);
  const objects = useStore((s) => s.objects);
  const config = useStore((s) => s.config);
  const origin = useStore((s) => s.origin);
  const solarData = useStore((s) => s.solar.data);
  const finance = useStore((s) => s.finance);
  const inverterId = useStore((s) => s.electrical.inverterId);
  const lat = origin?.lat ?? 28.6;
  const rawCatalog = useStore((s) => s.catalog);
  const catalog = useMemo(() => normalizeCatalog(rawCatalog), [rawCatalog]);
  const selectedPackage = useMemo(() => {
    if (!catalog.packages?.length) return null;
    return catalog.packages.find((p) => p.id === config.packageId) || catalog.packages[0] || null;
  }, [catalog.packages, config.packageId]);

  const spec = useMemo(() => {
    const defaultSpec = catalog.panels.find((p) => p.id === config.specId) || catalog.panels[0];
    if (config.pricingMode === 'package' && selectedPackage?.items?.length) {
      const panelItem = selectedPackage.items.find((it) => it.itemType === 'panel' || it.name?.toLowerCase().includes('panel'));
      if (panelItem) {
        // Extract watts if specified in model or spec (e.g. 550W, 540 W)
        const wattsMatch = (panelItem.model + ' ' + panelItem.spec + ' ' + panelItem.name).match(/(\d{3,4})\s*w/i);
        const parsedWatts = wattsMatch ? Number(wattsMatch[1]) : defaultSpec.watts;
        return {
          ...defaultSpec,
          brand: panelItem.brand || defaultSpec.brand,
          model: panelItem.model || defaultSpec.model,
          watts: parsedWatts || defaultSpec.watts,
          name: [panelItem.brand, panelItem.model, `${parsedWatts || defaultSpec.watts} W`].filter(Boolean).join(' '),
        };
      }
    }
    return defaultSpec;
  }, [catalog.panels, config.specId, config.pricingMode, selectedPackage]);

  const pillar = useMemo(() => {
    const defaultPillar = catalog.pillars.find((p) => p.id === config.pillarId) || catalog.pillars[0];
    if (config.pricingMode === 'package' && selectedPackage?.items?.length) {
      const poleItem = selectedPackage.items.find(
        (it) => it.itemType === 'poles' || it.name?.toLowerCase().includes('pole') || it.name?.toLowerCase().includes('structure')
      );
      if (poleItem) {
        return {
          ...defaultPillar,
          name: [poleItem.brand, poleItem.model || poleItem.name].filter(Boolean).join(' ') || defaultPillar.name,
        };
      }
    }
    return defaultPillar;
  }, [catalog.pillars, config.pillarId, config.pricingMode, selectedPackage]);

  const design = useMemo(() => buildDesign({ sections, objects, config, lat, spec }), [sections, objects, config, lat, spec]);
  const defaultAzimuth = useMemo(() => resolveAzimuth(config, design.sections, lat), [config, design.sections, lat]);
  const yieldModel = useMemo(() => buildYieldModel(lat, solarData), [lat, solarData]);
  // shading is the heavy part — let it lag behind while dragging so movement stays smooth
  const settled = useDeferredValue(design);
  const shade = useMemo(() => shadingLoss(settled, lat), [settled, lat]);
  const structure = useMemo(() => computeStructure(design), [design]);
  const electrical = useMemo(() => designElectrical(design, { ...structure, pillar }, { inverterId }), [design, structure, pillar, inverterId]);

  const totals = useMemo(() => {
    const eff = finance.efficiency / 100;
    const kw = design.spec.watts / 1000;
    let dc = 0;
    let lostShade = 0;
    const monthly = new Array(12).fill(0);
    const groups = new Map();
    for (const m of design.modules) {
      const gross = kw * yieldModel.specificYield(m.tilt, m.azimuth);
      const loss = shade.get(m.id) || 0;
      dc += gross * (1 - loss);
      lostShade += gross * loss;
      const key = `${Math.round(m.tilt)}|${Math.round(m.azimuth)}`;
      const g = groups.get(key) || { tilt: Math.round(m.tilt), azimuth: Math.round(m.azimuth), count: 0, dc: 0 };
      g.count++;
      g.dc += gross * (1 - loss);
      groups.set(key, g);
    }
    for (const g of groups.values()) yieldModel.monthlyShare(g.tilt, g.azimuth).forEach((sh, i) => (monthly[i] += sh * g.dc * eff));
    const count = design.modules.length;
    const kwp = count * kw;
    return {
      count,
      kwp,
      acKwh: dc * eff,
      shadeLossPct: dc + lostShade > 0 ? (lostShade / (dc + lostShade)) * 100 : 0,
      specificYield: kwp ? (dc * eff) / kwp : 0,
      monthly,
      groups: [...groups.values()],
      invalid: design.tables.filter((t) => !t.valid).length,
    };
  }, [design, yieldModel, shade, finance.efficiency]);

  const cost = useMemo(() => {
    const pillarFt = structure.columnM * 3.281;
    const panels = totals.count * spec.price;
    const pillars = pillarFt * pillar.pricePerFt;

    // Dynamic material categories from company
    const cm = config.customMaterials || {};
    const categories = catalog.materialCategories || [];
    const selectedCategoryMaterials = [];
    let materialsSum = 0;

    for (const cat of categories) {
      const entry = cm[cat.id];
      if (entry && entry.productId) {
        const prod = cat.products?.find((p) => p.id === entry.productId);
        if (prod) {
          const qty = Math.max(1, Number(entry.qty) || 1);
          const lineTotal = (Number(prod.price) || 0) * qty;
          materialsSum += lineTotal;
          selectedCategoryMaterials.push({
            categoryId: cat.id,
            categoryName: cat.name,
            productId: prod.id,
            productName: prod.name,
            unit: prod.unit || (cat.name.toLowerCase().includes('wire') ? 'bundles' : 'nos'),
            price: Number(prod.price) || 0,
            qty,
            total: lineTotal,
          });
        }
      }
    }

    const hasChosenMaterials = selectedCategoryMaterials.length > 0;
    const other = hasChosenMaterials ? materialsSum : totals.kwp * catalog.otherCostPerKw;

    const customSubtotal = panels + pillars + other;
    const floorCost = Number(config.floorCost) || 0;
    const isPackage = config.pricingMode === 'package' && selectedPackage;
    const packagePrice = isPackage ? Number(selectedPackage.price) || 0 : 0;
    const baseTotal = isPackage ? packagePrice : customSubtotal;
    const subtotal = baseTotal + floorCost;
    const gst = computeGst(subtotal, { included: config.gstIncluded, percent: config.gstPercent });

    return {
      panels,
      pillars,
      pillarFt,
      other,
      materialsSum,
      hasChosenMaterials,
      categoryMaterials: selectedCategoryMaterials,
      customSubtotal,
      isPackage: Boolean(isPackage),
      packagePrice,
      package: selectedPackage,
      floorPlacement: Number(config.floorPlacement) || 0,
      floorCost,
      subtotal,
      ...gst,
      total: gst.grandTotal,
    };
  }, [structure, totals, spec, pillar, catalog, config.pricingMode, config.floorCost, config.floorPlacement, config.customMaterials, config.gstIncluded, config.gstPercent, selectedPackage]);



  const fin = useMemo(
    () => computeFinancials({ ...finance, kwp: totals.kwp, annualKwh: totals.acKwh, tariff: catalog.tariff, costPerKw: totals.kwp ? cost.total / totals.kwp : 0 }),
    [totals, finance, cost, catalog.tariff],
  );

  return { ...design, catalog, pillar, cost, selectedPackage, currency: catalog.currency, lat, origin, defaultAzimuth, yieldModel, shade, electrical, structure, totals, fin, solarData };
}

