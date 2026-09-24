'use client';

// Form validation, mirroring backend/src/validation (same rules, same messages) so people are told what is
// wrong before a request is sent; the server checks again. Keep the two in step.
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

// null → '' so a cleared field counts as blank; undefined (key absent) is left alone so partial updates stay partial
const blankToEmpty = (v) => (v === null ? '' : v);

/** A string field that may be empty; when not empty it must pass `check`. `transform` normalises first. */
function optional(check, message, { max = 200, transform = (v) => v } = {}) {
  return z
    .preprocess(
      blankToEmpty,
      z.string('Enter text').trim().max(max, `Too long (up to ${max} characters)`).transform(transform).refine((v) => v === '' || check(v), message),
    )
    .optional();
}
/** Same, but must be filled. */
function required(check, message, { max = 200, transform = (v) => v, blank = 'This field is required' } = {}) {
  return z.preprocess(
    blankToEmpty,
    z.string(blank).trim().min(1, blank).max(max, `Too long (up to ${max} characters)`).transform(transform).refine(check, message),
  );
}

/* ───────────── patterns ───────────── */

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const validEmail = (v) => EMAIL.test(v) && !v.includes('..') && !v.startsWith('.') && !v.split('@')[0].endsWith('.');

/** A 10-digit Indian mobile (starting 6–9). A leading +91 / 91 / 0 and separators are accepted and dropped. */
const normalizePhone = (v) => {
  let p = v.replace(/[\s().+-]/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  else if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  return p;
};
const validPhone = (v) => /^[6-9]\d{9}$/.test(v);

/** PAN: 5 letters, 4 digits, 1 letter; the 4th letter is the holder type (P person, C company, …). */
const validPan = (v) => /^[A-Z]{3}[ABCFGHJKLPT][A-Z]\d{4}[A-Z]$/.test(v);

/** GSTIN: state code (01–38), the holder's PAN, entity number, 'Z', check character. */
const validGstin = (v) => /^(0[1-9]|[12]\d|3[0-8])[A-Z]{3}[ABCFGHJKLPT][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v);

const validWebsite = (v) => {
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(url.protocol) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) && /[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
};

const PERSON = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;
const ORG = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s.,&'’()/+-]*$/u;

/* ───────────── text-like fields ───────────── */

export const emailRequired = required(validEmail, 'Enter a valid email address (like name@company.com)', { transform: (v) => v.toLowerCase(), blank: 'Email is required' });
export const emailOptional = optional(validEmail, 'Enter a valid email address (like name@company.com)', { transform: (v) => v.toLowerCase() });
export const phoneOptional = optional(validPhone, 'Enter a valid 10-digit mobile number (starting with 6, 7, 8 or 9)', { max: 20, transform: normalizePhone });
export const panOptional = optional(validPan, 'Enter a valid PAN, like ABCDE1234F', { max: 10, transform: (v) => v.toUpperCase() });
export const gstinOptional = optional(validGstin, 'Enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5', { max: 15, transform: (v) => v.toUpperCase() });
export const websiteOptional = optional(validWebsite, 'Enter a valid website, like www.example.com');
export const personNameRequired = required((v) => v.length >= 2 && PERSON.test(v), 'Enter a valid name (letters only, at least 2)', { max: 120, blank: 'Name is required' });
export const personNameOptional = optional((v) => v.length >= 2 && PERSON.test(v), 'Enter a valid name (letters only, at least 2)', { max: 120 });
export const orgNameRequired = required((v) => v.length >= 2 && ORG.test(v), 'Enter a valid name', { max: 120, blank: 'Name is required' });
export const consumerNumberOptional = optional((v) => /^[A-Za-z0-9][A-Za-z0-9/-]{3,29}$/.test(v), 'Enter a valid consumer number (4–30 letters, digits, - or /)', { max: 30 });
export const skuOptional = optional((v) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v), 'SKU can only have letters, digits and . _ - /', { max: 60 });
export const hsnOptional = optional((v) => /^\d{4}(\d{2}(\d{2})?)?$/.test(v), 'HSN code must be 4, 6 or 8 digits', { max: 8 });
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1d4ed8');
export const currencyCode = z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, like INR'));

/** Free text: any characters, capped. */
export const textOptional = (max, label = 'Text') => z.preprocess(blankToEmpty, z.string('Enter text').trim().max(max, `${label} can be at most ${max} characters`)).optional();
export const textRequired = (max, label = 'This field') => z.preprocess(blankToEmpty, z.string(`${label} is required`).trim().min(1, `${label} is required`).max(max, `${label} can be at most ${max} characters`));

/** Password being SET: 8+ characters with a letter and a digit. (Sign-in only checks it is present.) */
export const newPassword = z.string('Enter a password').min(8, 'Password must be at least 8 characters').max(200, 'Password is too long').refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password needs at least one letter and one number');
export const optionalNewPassword = z.preprocess(blankToEmpty, z.union([z.literal(''), newPassword])).optional();
export const loginPassword = z.string('Password is required').min(1, 'Password is required').max(200, 'Password is too long');

/* ───────────── numbers (blank string → treated as "not given") ───────────── */

const numberLike = (v) => (typeof v === 'string' ? (v.trim() === '' ? null : Number(v)) : v);

/** Required number in range. */
export const num = ({ min = 0, max = 1e9, int = false, label = 'Value' } = {}) => {
  let s = z.number(`${label} must be a number`).finite(`${label} must be a number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`);
  if (int) s = s.int(`${label} must be a whole number`);
  return z.preprocess(numberLike, s);
};
/** May be blank (→ null); otherwise in range. */
export const numOptional = (opts) => z.preprocess((v) => (v === undefined ? undefined : numberLike(v)), num(opts).nullable().optional().or(z.null()));

export const lat = num({ min: -90, max: 90, label: 'Latitude' });
export const lng = num({ min: -180, max: 180, label: 'Longitude' });
export const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const objectIdOrBlank = z.preprocess(blankToEmpty, z.union([z.literal(''), objectIdString])).optional();

export { z };

const common = { emailRequired, emailOptional, phoneOptional, panOptional, gstinOptional, websiteOptional, personNameRequired, personNameOptional, orgNameRequired, consumerNumberOptional, skuOptional, hsnOptional, hexColor, currencyCode, textOptional, textRequired, newPassword, optionalNewPassword, loginPassword, num, numOptional, lat, lng, objectIdString, objectIdOrBlank, z };
const PRODUCT_TYPES = ['general', 'panels', 'poles'];
const PILLAR_SHAPES = ['l-shape', 'cylindrical', 'square'];
const STEP_STATUS = ['pending', 'in_progress', 'done'];
const TICKET_CATEGORIES = ['technical', 'billing', 'account', 'other'];
const TICKET_PRIORITIES = ['low', 'normal', 'high'];
const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'closed'];

const f = { ...common };
// Request schemas, one per form/endpoint. Objects are "loose": fields not listed here pass through untouched
// (the services still pick what they accept), while every listed field is checked and normalised.

const obj = (shape) => z.looseObject(shape);
const strArray = (max, itemMax = 60) => z.array(z.string().trim().max(itemMax, `Each entry can be at most ${itemMax} characters`)).max(max, `Up to ${max} entries`);

/* ───────────── auth ───────────── */

export const loginSchema = obj({ email: f.emailRequired, password: f.loginPassword });
export const profileSchema = obj({ name: f.personNameOptional });
export const passwordChangeSchema = obj({ current: f.loginPassword, next: f.newPassword });

/* ───────────── clients ───────────── */

export const clientSchema = obj({
  name: f.orgNameRequired,
  email: f.emailOptional,
  phone: f.phoneOptional,
  pan: f.panOptional,
  address: f.textOptional(400, 'Address'),
  notes: f.textOptional(1000, 'Notes'),
  consumerNumber: f.consumerNumberOptional,
  kwRequired: f.numOptional({ min: 0.1, max: 100000, label: 'Required kW' }),
  source: f.textOptional(80, 'Source'),
  referredBy: obj({ name: f.personNameOptional, phone: f.phoneOptional }).optional(),
});
export const clientUpdateSchema = clientSchema.partial();

/* ───────────── company / admin ───────────── */

const companyProfile = {
  name: f.orgNameRequired,
  email: f.emailOptional,
  phone: f.phoneOptional,
  address: f.textOptional(400, 'Address'),
  website: f.websiteOptional,
  taxId: f.gstinOptional,
  pan: f.panOptional,
};

export const companySelfSchema = obj({
  ...companyProfile,
  signatoryName: f.personNameOptional,
  signatoryTitle: f.textOptional(80, 'Title'),
  qrLabel: f.textOptional(80, 'QR label'),
  tagline: f.textOptional(160, 'Tagline'),
  currency: f.currencyCode.optional(),
  tariff: f.num({ min: 0, max: 1000, label: 'Tariff' }).optional(),
  otherCostPerKw: f.num({ min: 0, max: 1e7, label: 'Other cost per kW' }).optional(),
}).partial();

const limits = obj({
  maxClients: f.num({ min: 1, max: 1e6, int: true, label: 'Max clients' }).optional(),
  maxDesigns: f.num({ min: 1, max: 1e6, int: true, label: 'Max designs' }).optional(),
  maxConcurrentLogins: f.num({ min: 1, max: 1000, int: true, label: 'Concurrent logins' }).optional(),
});

export const adminCompanyCreateSchema = obj({
  ...companyProfile,
  loginEmail: f.emailRequired,
  password: f.newPassword,
  contactName: f.personNameOptional,
  notes: f.textOptional(1000, 'Notes'),
  limits: limits.optional(),
});
export const adminCompanyUpdateSchema = obj({ ...companyProfile, notes: f.textOptional(1000, 'Notes'), limits: limits.optional() }).partial();
export const passwordResetSchema = obj({ password: f.newPassword });

export const planSchema = obj({
  name: f.orgNameRequired,
  description: f.textOptional(300, 'Description'),
  priceMonthly: f.num({ min: 0, max: 1e7, label: 'Monthly price' }).optional(),
  maxClients: f.num({ min: 1, max: 1e6, int: true, label: 'Max clients' }).optional(),
  maxDesigns: f.num({ min: 1, max: 1e6, int: true, label: 'Max designs' }).optional(),
  maxConcurrentLogins: f.num({ min: 1, max: 1000, int: true, label: 'Concurrent logins' }).optional(),
  features: z.array(z.string().trim().max(100, 'A feature can be at most 100 characters')).max(20, 'A plan can list up to 20 features').optional(),
});
export const planUpdateSchema = planSchema.partial();

/* ───────────── agents ───────────── */

export const agentCreateSchema = obj({ name: f.personNameRequired, email: f.emailRequired, password: f.newPassword, phone: f.phoneOptional, roles: strArray(10, 40).optional() });
export const agentUpdateSchema = obj({ name: f.personNameRequired, email: f.emailRequired, password: f.optionalNewPassword, phone: f.phoneOptional, roles: strArray(10, 40).optional() }).partial();

/* ───────────── catalog ───────────── */

export const categorySchema = obj({
  name: f.textRequired(60, 'Category name'),
  description: f.textOptional(300, 'Description'),
  type: z.enum(PRODUCT_TYPES, 'Invalid category type').optional(),
  specKeys: strArray(40).optional(),
});
export const categoryUpdateSchema = categorySchema.partial();

const spec = obj({ key: z.string().trim().max(60, 'Specification name is too long'), value: z.string().trim().max(200, 'Specification value is too long').optional() });
const year = new Date().getFullYear() + 1;

export const productSchema = obj({
  category: f.objectIdString,
  name: f.textOptional(120, 'Product name'),
  brand: f.textOptional(60, 'Brand'),
  model: f.textOptional(60, 'Model'),
  sku: f.skuOptional,
  hsnCode: f.hsnOptional,
  unit: f.textOptional(20, 'Unit'),
  price: f.numOptional({ min: 0, max: 1e9, label: 'Price' }),
  quantity: f.numOptional({ min: 0, max: 1e9, label: 'Quantity' }),
  warrantyYears: f.numOptional({ min: 0, max: 60, int: true, label: 'Warranty' }),
  description: f.textOptional(1000, 'Description'),
  watts: f.numOptional({ min: 1, max: 2000, label: 'Watt' }),
  manufactureYear: f.numOptional({ min: 1990, max: year, int: true, label: 'Manufacture year' }),
  length: f.numOptional({ min: 0.2, max: 5, label: 'Length' }),
  width: f.numOptional({ min: 0.2, max: 5, label: 'Width' }),
  shape: z.enum(PILLAR_SHAPES, 'Invalid shape').optional(),
  specs: z.array(spec).max(40, 'A product can have up to 40 specifications').optional(),
});
export const productUpdateSchema = productSchema.partial();

const packageItem = obj({ productId: f.objectIdString, qty: f.num({ min: 0, max: 1e6, label: 'Quantity' }), unit: f.textOptional(20, 'Unit') });
export const packageSchema = obj({
  name: f.textRequired(120, 'Package name'),
  kw: f.numOptional({ min: 0, max: 100000, label: 'Capacity (kW)' }),
  price: f.num({ min: 0, max: 1e10, label: 'Price' }),
  description: f.textOptional(1000, 'Description'),
  items: z.array(packageItem).max(100, 'A package can have up to 100 lines').optional(),
});

/* ───────────── installations ───────────── */

const stepFields = {
  name: f.textRequired(80, 'Step name'),
  description: f.textOptional(400, 'Description'),
  role: f.textOptional(40, 'Role'),
  assignee: f.objectIdOrBlank,
};
export const stepCreateSchema = obj(stepFields);
export const stepUpdateSchema = obj({
  ...stepFields,
  status: z.enum(STEP_STATUS, 'Invalid step status').optional(),
  move: z.enum(['up', 'down']).optional(),
  message: f.textOptional(1000, 'Message'),
  lat: f.lat.optional(),
  lng: f.lng.optional(),
}).partial();
export const agentStepStatusSchema = obj({
  status: z.enum(STEP_STATUS, 'Invalid step status'),
  message: f.textOptional(1000, 'Message'),
  lat: f.lat.optional(),
  lng: f.lng.optional(),
});
export const noteSchema = obj({ message: f.textRequired(1000, 'Note') });
export const projectStartSchema = obj({ design: f.objectIdString });

/* ───────────── support tickets (fields arrive as multipart text) ───────────── */

export const ticketCreateSchema = obj({
  subject: f.textRequired(150, 'Subject').refine((v) => v.length >= 3, 'Subject must be at least 3 characters'),
  body: f.textOptional(4000, 'Message'),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});
export const ticketMessageSchema = obj({ body: f.textOptional(4000, 'Message') });
export const ticketStatusSchema = obj({ status: z.enum(TICKET_STATUS, 'Invalid ticket status') });

/* ───────────── designs ───────────── */

export const designCreateSchema = obj({ client: f.objectIdString, name: f.textOptional(120, 'Design name') });

/* ───────────── form helper ───────────── */

/** { ok, data, errors } — errors keyed by field path ('email', 'referredBy.phone'). */
export function checkForm(schema, values) {
  const result = schema.safeParse(values ?? {});
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, data: null, errors };
}

/**
 * Validate a form against a schema. Nothing is shown until the first submit attempt; after that the messages
 * follow the values live. `validate()` returns the cleaned data, or null when something is wrong.
 *   const v = useValidation(clientSchema, form);
 *   <FormField error={v.error('email')} …>      const data = v.validate(); if (!data) return;
 */
export function useValidation(schema, values) {
  const [submitted, setSubmitted] = useState(false);
  const live = useMemo(() => checkForm(schema, values), [schema, values]);
  const validate = useCallback(() => {
    setSubmitted(true);
    return live.ok ? live.data : null;
  }, [live]);
  const error = useCallback((name) => (submitted ? live.errors[name] : undefined), [submitted, live]);
  const reset = useCallback(() => setSubmitted(false), []);
  return { validate, error, reset, errors: submitted ? live.errors : {}, valid: live.ok };
}
