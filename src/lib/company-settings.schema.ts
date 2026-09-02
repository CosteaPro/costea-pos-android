import { z } from "zod";
import { isValidRuc } from "@/lib/sri";

/**
 * Validación compartida de la configuración de la empresa.
 * El mismo esquema se usa en el navegador (experiencia) y en el servidor
 * (seguridad): nunca se confía sólo en la validación del cliente.
 */

const tresDigitos = z
  .string()
  .transform((v) => String(v ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3))
  .refine((v) => /^\d{3}$/.test(v), "Debe tener 3 dígitos");

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

const numero = (min: number, max: number) =>
  z.coerce.number().refine((v) => Number.isFinite(v) && v >= min && v <= max, `Debe estar entre ${min} y ${max}`);

export const companySettingsSchema = z.object({
  business_name: texto(200).min(1, "La razón social es obligatoria"),
  trade_name: texto(200).min(1, "El nombre del restaurante es obligatorio"),
  ruc: z
    .string()
    .transform((v) => String(v ?? "").replace(/\D/g, ""))
    .refine((v) => v === "" || isValidRuc(v), "El RUC debe tener 13 dígitos válidos y terminar en 001"),
  address: texto(300).min(1, "La dirección matriz es obligatoria"),
  branch_address: texto(300).default(""),
  phone: z
    .string()
    .trim()
    .max(40, "Máximo 40 caracteres")
    .refine((v) => v === "" || /^[\d\s+()-]{6,40}$/.test(v), "Teléfono inválido"),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Correo inválido"),
  tax_regime: texto(60).min(1, "Selecciona el régimen tributario"),
  special_taxpayer: texto(30).nullable().default(null),
  accounting_required: z.boolean(),
  establishment: tresDigitos,
  emission_point: tresDigitos,
  next_sequential: z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(1, "Mínimo 1")
    .max(999999999, "Máximo 999999999"),
  environment: z.enum(["1", "2"], { message: "Ambiente inválido" }),
  emission_type: z.enum(["1"], { message: "Tipo de emisión inválido" }),
  iva_rate: numero(0, 100),
  service_charge_rate: numero(0, 100),
  printer_kitchen: texto(120).default(""),
  printer_grill: texto(120).default(""),
  printer_pos: texto(120).default(""),
  printer_copies: z.coerce.number().int().min(1, "Mínimo 1 copia").max(5, "Máximo 5 copias"),
  prep_limit_minutes: z.coerce.number().int().min(0).max(240, "Máximo 240 minutos"),
  prep_limit_mesa: z.coerce.number().int().min(0).max(240, "Máximo 240 minutos"),
  prep_limit_llevar: z.coerce.number().int().min(0).max(240, "Máximo 240 minutos"),
  prep_limit_domicilio: z.coerce.number().int().min(0).max(240, "Máximo 240 minutos"),
});

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
export type CompanySettingsValues = z.output<typeof companySettingsSchema>;

export const CAMPO_LABEL: Record<string, string> = {
  business_name: "Razón social",
  trade_name: "Nombre del restaurante",
  ruc: "RUC",
  address: "Dirección matriz",
  branch_address: "Dirección sucursal",
  phone: "Teléfono",
  email: "Correo",
  tax_regime: "Régimen tributario",
  special_taxpayer: "Contribuyente especial",
  accounting_required: "Obligado a llevar contabilidad",
  establishment: "Establecimiento",
  emission_point: "Punto de emisión",
  next_sequential: "Siguiente secuencial",
  environment: "Ambiente SRI",
  emission_type: "Tipo de emisión",
  iva_rate: "IVA (%)",
  service_charge_rate: "Servicio (%)",
  printer_kitchen: "Impresora cocina",
  printer_grill: "Impresora parrilla",
  printer_pos: "Impresora caja",
  printer_copies: "Copias de impresión",
  prep_limit_minutes: "Límite de preparación",
  prep_limit_mesa: "Límite mesa",
  prep_limit_llevar: "Límite para llevar",
  prep_limit_domicilio: "Límite domicilio",
};

/** Devuelve los errores por campo, listos para mostrarlos bajo cada input. */
export function validarConfiguracion(values: unknown) {
  const parsed = companySettingsSchema.safeParse(values);
  if (parsed.success) return { ok: true as const, values: parsed.data, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false as const, values: null, errors };
}
