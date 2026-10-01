'use client';

import { useDeferredValue, useMemo } from 'react';
import { allocate } from './buildings.js';
import { designElectricalByBuilding } from './electrical.js';
import { buildYieldModel, computeFinancials } from './energy.js';
import { DEFAULT_INSTALL_HSN, installChargeGstPercent, packageToPricingLines, summarizeLinePricing } from './pricing.js';
import { normalizeCatalog } from './catalog.js';
import { buildDesign, resolveAzimuth, sectionAzimuth } from './model.js';
import { shadingLoss } from './shading.js';
import { useStore } from './store.js';
import { computeStructure } from './structure.js';

export function useDesign() {
  const sections = useStore((s) => s.sections);
  const buildings = useStore((s) => s.buildings);
  const objects = useStore((s) => s.objects);
  const config = useStore((s) => s.config);
  const origin = useStore((s) => s.origin);
  const solarData = useStore((s) => s.solar.data);
  const finance = useStore((s) => s.finance);
  const inverterId = useStore((s) => s.electrical.inverterId);
  const lat = origin?.lat ?? 28.6;
  const rawCatalog = useStore((s) => s.catalog);
  // a design can carry its own electricity rate; otherwise the company's rate applies
  const catalog = useMemo(() => {
    const c = normalizeCatalog(rawCatalog);
    return Number(config.tariff) > 0 ? { ...c, tariff: Number(config.tariff) } : c;
  }, [rawCatalog, config.tariff]);
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

  const design = useMemo(() => buildDesign({ sections, buildings, objects, config, lat, spec }), [sections, buildings, objects, config, lat, spec]);
  // in "follow the building" mode every building's panels follow its own walls
  const azimuthFor = useMemo(() => (sec) => sectionAzimuth(config, design.sections, lat, sec), [config, design.sections, lat]);
  const defaultAzimuth = useMemo(() => resolveAzimuth(config, design.sections, lat), [config, design.sections, lat]);
  const yieldModel = useMemo(() => buildYieldModel(lat, solarData), [lat, solarData]);
  // shading is the heavy part — let it lag behind while dragging so movement stays smooth
  const settled = useDeferredValue(design);
  const shade = useMemo(() => shadingLoss(settled, lat), [settled, lat]);
  const structure = useMemo(() => computeStructure(design), [design]);
  const structures = useMemo(() => new Map(design.buildings.map((b) => [b.id, { ...computeStructure({ ...design, tables: design.tables.filter((t) => t.building === b.id) }), pillar }])), [design, pillar]);
  const electrical = useMemo(() => designElectricalByBuilding(design, structures, { inverterId }), [design, structures, inverterId]);

  const totals = useMemo(() => {
    const eff = finance.efficiency / 100;
    const kw = design.spec.watts / 1000;
    let dc = 0;
    let lostShade = 0;
    const monthly = new Array(12).fill(0);
    const groups = new Map();
    const perBuilding = new Map(design.buildings.map((b) => [b.id, { count: 0, dc: 0, lost: 0 }]));
    for (const m of design.modules) {
      const gross = kw * yieldModel.specificYield(m.tilt, m.azimuth);
      const loss = shade.get(m.id) || 0;
      dc += gross * (1 - loss);
      lostShade += gross * loss;
      const own = perBuilding.get(m.building);
      if (own) {
        own.count++;
        own.dc += gross * (1 - loss);
        own.lost += gross * loss;
      }
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
      buildings: design.buildings.map((b) => {
        const own = perBuilding.get(b.id);
        return { id: b.id, name: b.name, count: own.count, kwp: own.count * kw, acKwh: own.dc * eff, shadeLossPct: own.dc + own.lost > 0 ? (own.lost / (own.dc + own.lost)) * 100 : 0 };
      }),
    };
  }, [design, yieldModel, shade, finance.efficiency]);

  const cost = useMemo(() => {
    const pillarFt = structure.columnM * 3.281;
    const panels = totals.count * spec.price;
    const pillars = pillarFt * pillar.pricePerFt;
    const applyGst = config.withGst !== false;
    const defGst = Number(config.gstPercent) || 18;

    // Dynamic material categories from company
    const cm = config.customMaterials || {};
    const categories = catalog.materialCategories || [];
    const selectedCategoryMaterials = [];

    for (const cat of categories) {
      const entry = cm[cat.id];
      if (entry && entry.productId) {
        const prod = cat.products?.find((p) => p.id === entry.productId);
        if (prod) {
          const qty = Math.max(1, Number(entry.qty) || 1);
          const price = entry.price != null && entry.price !== '' ? Number(entry.price) : Number(prod.price) || 0;
          const gstPercent = entry.gstPercent != null && entry.gstPercent !== '' ? Number(entry.gstPercent) : (Number(prod.gstPercent) >= 0 ? Number(prod.gstPercent) : defGst);
          selectedCategoryMaterials.push({
            categoryId: cat.id,
            categoryName: cat.name,
            parentName: cat.parentName || '',
            parentOrder: Number(cat.parentOrder) || 0,
            productId: prod.id,
            productName: prod.name,
            unit: prod.unit || (cat.name.toLowerCase().includes('wire') ? 'bundles' : 'nos'),
            price,
            gstPercent,
            hsnCode: prod.hsnCode || '',
            qty,
            total: price * qty,
          });
        }
      }
    }

    const hasChosenMaterials = selectedCategoryMaterials.length > 0;
    const bosFallback = totals.kwp * catalog.otherCostPerKw;

    const floorCost = Number(config.floorCost) || 0;
    const isPackage = config.pricingMode === 'package' && selectedPackage;
    const packagePrice = isPackage ? Number(selectedPackage.price) || 0 : 0;
    const installationCharges = (Array.isArray(config.installationCharges) ? config.installationCharges : []).filter((c) => c?.name);

    const restLines = [];
    const materialLines = selectedCategoryMaterials.map((m) => ({
      name: m.categoryName,
      detail: m.productName,
      qty: m.qty,
      unit: m.unit,
      rate: m.price,
      gstPercent: m.gstPercent,
      hsn: m.hsnCode,
    }));

    if (isPackage) {
      restLines.push(...packageToPricingLines(selectedPackage, packagePrice, defGst));
    } else {
      restLines.push({ name: 'Solar modules', detail: spec.name, qty: totals.count, unit: 'nos', rate: spec.price, gstPercent: spec.gstPercent ?? defGst, hsn: spec.hsnCode || '' });
      if (pillars > 0) restLines.push({ name: 'Mounting structure', detail: pillar.name, qty: 1, unit: 'Nos', rate: pillars, gstPercent: pillar.gstPercent ?? defGst, hsn: pillar.hsnCode || '7308' });
      if (!hasChosenMaterials) restLines.push({ name: 'Balance of system', qty: 1, unit: 'Set', rate: bosFallback, gstPercent: defGst, hsn: '85049090' });
    }
    if (floorCost > 0) restLines.push({ name: 'Floor placement', detail: `Floor ${Number(config.floorPlacement) || 0}`, qty: 1, unit: 'Nos', rate: floorCost, gstPercent: defGst, hsn: DEFAULT_INSTALL_HSN });
    for (const c of installationCharges) {
      restLines.push({ name: c.name, detail: 'Installation charge', qty: 1, unit: 'Nos', rate: Number(c.price) || 0, gstPercent: installChargeGstPercent(c, defGst), hsn: c.hsnCode || c.hsn || DEFAULT_INSTALL_HSN });
    }

    const allLines = [...materialLines, ...restLines];
    const priced = summarizeLinePricing({ lines: allLines, gstIncluded: false, withGst: applyGst });
    const categoryMaterials = selectedCategoryMaterials.map((m, i) => ({
      ...m,
      total: priced.lines[i]?.lineTotal ?? m.total,
      baseTotal: priced.lines[i]?.amount ?? m.total,
    }));
    const materialsSum = categoryMaterials.reduce((a, m) => a + m.baseTotal, 0);
    const other = hasChosenMaterials ? materialsSum : bosFallback;

    const customSubtotal = panels + pillars + other;
    const installTotal = installationCharges.reduce((a, c) => a + (Number(c.price) || 0), 0);
    const total = priced.total;

    const gst = {
      subtotal: priced.taxableTotal,
      withGst: applyGst,
      gstIncluded: false,
      gstPercent: priced.gstRate,
      gstAmount: priced.gstTotal,
      sgst: priced.sgst,
      cgst: priced.cgst,
      grandTotal: priced.total,
    };
    const own = totals.buildings.map((b) => (isPackage ? 0 : b.count * spec.price + (structures.get(b.id)?.columnM || 0) * 3.281 * pillar.pricePerFt));
    const ownSum = own.reduce((a, v) => a + v, 0);
    const shares = allocate(total - Math.min(ownSum, total), totals.buildings.map((b) => b.kwp));
    const scale = ownSum > total && ownSum > 0 ? total / ownSum : 1; // never more than the price itself
    const byBuilding = totals.buildings.map((b, i) => {
      const modulesCost = isPackage ? 0 : b.count * spec.price * scale;
      const structureCost = isPackage ? 0 : own[i] * scale - modulesCost;
      return { ...b, modulesCost, structureCost, shared: shares[i], total: modulesCost + structureCost + shares[i] };
    });

    return {
      buildings: byBuilding,
      panels,
      pillars,
      pillarFt,
      other,
      materialsSum,
      hasChosenMaterials,
      categoryMaterials,
      customSubtotal,
      isPackage: Boolean(isPackage),
      packagePrice,
      package: selectedPackage,
      floorPlacement: Number(config.floorPlacement) || 0,
      floorCost,
      installationCharges,
      installTotal,
      lineSubtotal: priced.subtotal,
      ...gst,
      total: gst.grandTotal,
    };
  }, [structure, structures, totals, spec, pillar, catalog, config.pricingMode, config.floorCost, config.floorPlacement, config.installationCharges, config.customMaterials, config.withGst, config.gstPercent, selectedPackage]);



  const fin = useMemo(
    () => computeFinancials({ ...finance, years: Math.max(1, Math.min(30, Math.round(Number(config.outlookYears) || 10))), kwp: totals.kwp, annualKwh: totals.acKwh, tariff: catalog.tariff, costPerKw: totals.kwp ? cost.total / totals.kwp : 0 }),
    [totals, finance, cost, catalog.tariff, config.outlookYears],
  );

  return { ...design, catalog, pillar, cost, selectedPackage, currency: catalog.currency, lat, origin, defaultAzimuth, azimuthFor, structures, yieldModel, shade, electrical, structure, totals, fin, solarData };
}

