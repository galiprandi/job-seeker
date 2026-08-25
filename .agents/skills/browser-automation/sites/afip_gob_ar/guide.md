---
name: afip-gov-ar
description: Automate AFIP/ARCA (Argentina tax authority) portal and SiRADIG F572 Web form for annual income tax deductions. Use when navigating AFIP/ARCA, loading SiRADIG, managing tax deductions, family charges, rent deductions, or any ARCA clave fiscal workflow.
---

# AFIP / ARCA — Automation guide

> **Validated:** 2026-08-24 against live site
> **Domain:** `afip.gob.ar` / `auth.afip.gob.ar` / `portalcf.cloud.afip.gob.ar` / `serviciosjava2.afip.gob.ar`

## Prerequisite

This guide assumes the [browser-automation SKILL.md](../SKILL.md) golden rules and wrapper (`browser.js`).

## Site architecture

AFIP/ARCA has 4 layers:

1. **Portal público** — `https://www.afip.gob.ar/landing/default.asp`
   - Landing page, news, service links.
   - "Iniciar sesión" button → login.

2. **Login (Clave Fiscal)** — `https://auth.afip.gob.ar/contribuyente_/login.xhtml`
   - CUIT/CUIL field (spinbutton).
   - "Siguiente" button.
   - Virtual keyboard for password — **never automate password entry**.
   - "Ingresar" button.

3. **Portal de Clave Fiscal** — `https://portalcf.cloud.afip.gob.ar/portal/app/`
   - Post-login dashboard.
   - Shows user name and CUIT.
   - "Servicios | Más utilizados" with links (SiRADIG, Mi SSSalud, etc.).
   - "Ver todos" for full catalog.

4. **Servicios Java (legacy JSP)** — `https://serviciosjava2.afip.gob.ar/...`
   - Legacy JSP apps that open in popups/new tabs.
   - Independent session — expires on inactivity (~30-60 min).
   - On expiry: "El Usuario no está Logueado o la Sesión ha expirado".

## Login flow

```
1. goto https://auth.afip.gob.ar/contribuyente_/login.xhtml
2. Fill CUIT in spinbutton (Chrome may autocomplete)
3. Click "Siguiente"
4. User enters password via virtual keyboard — DO NOT automate
5. Click "Ingresar"
6. Land on portal de clave fiscal
```

**Critical rules:**
- NEVER enter the user's password.
- NEVER save credentials to files.
- The user must click "Ingresar" or enter the password manually.
- Chrome may autocomplete the password if the user saved it — in that case just click "Ingresar".

## SiRADIG navigation

```
1. Be logged in to portal de clave fiscal.
2. Click "SiRADIG - Trabajador" (link in servicios más utilizados).
3. Popup opens in new tab: menu_sel_empresa.jsp
4. Click the button with the taxpayer's name.
5. Land on SiRADIG main menu.
```

**SiRADIG URLs:**
- Person selection: `https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp`
- Form menu: `https://serviciosjava2.afip.gob.ar/radig/jsp/verMenuDeducciones.do`
- Family charges: `https://serviciosjava2.afip.gob.ar/radig/jsp/verCargaFamilia.do`
- Employers: `https://serviciosjava2.afip.gob.ar/radig/jsp/verEmpleador.do`

**Gotcha:** Navigating directly to SiRADIG URLs (`verMenuDeducciones.do`, etc.) fails if the JSP session expired, even if the portal is still logged in. Must return to portal, click SiRADIG, click taxpayer name.

## SiRADIG structure (F572 Web)

### Main menu
- Datos Personales
- Empleadores
- Carga de Formulario
- Consulta de Formularios Enviados
- Consulta de Liquidaciones - F1357 / F2122 / F1359

### Form sections
1. **Detalles de las cargas de familia** — spouse, children, etc.
2. **Importe de las ganancias liquidadas** by other employers.
3. **Deducciones y desgravaciones** — rent, school, medical, etc.
4. **Otras Retenciones, Autorretenciones, Percepciones y Pagos a Cuenta**
5. **Beneficios**
- Ajustes
- Vista Previa

### Required load order
1. Datos Personales → Guardar
2. Empleadores → Guardar (designate withholding agent)
3. Only then Carga de Formulario works.

If Datos Personales or Empleadores are missing, "Carga de Formulario" redirects without a clear error.

## Family charges

### Form fields
- Tipo Documento: CUIT (80), CUIL (86), CDI (87), DNI (96), LC (89), LE (90)
- Nro. Documento (no hyphens)
- Apellido, Nombre
- Fecha de Nacimiento (dd/mm/yyyy)
- Parentesco: Cónyuge (1), Hijo/a menor 18 (3), Hijastro/a menor 18 (30), Hijo/a incapacitado (31), Hijastro/a incapacitado (32), Unión convivencial (51)
- Porcentaje de deducción: 50% or 100% (only for children/stepchildren)
- ¿Está a Cargo?: Sí/No
- ¿Residente en el País?: Sí/No
- ¿La persona declarada obtuvo ingresos?: Sí/No
- Monto Anual de los Ingresos (if income = Sí)
- Período: Mes Desde / Mes Hasta (default Enero-Diciembre)
- Vigente para próximos períodos fiscales (checkbox)

### Validations
- Spouse with annual income above the non-taxable minimum is NOT deductible (Art. 30 Ley I.G.).
- Error: "La persona que Usted pretende informar no cumple con los requisitos establecidos por el artículo 30 de la Ley del Impuesto a las Ganancias (t.o. 2019) para ser considerada Carga de Familia"
- Children under 18 do not need income info.
- If both parents deduct the child, each computes 50%.

## Rent deduction (Beneficio 40%, Art. 85 inc. h)

### Navigation
1. Section 3 - Deducciones → "Agregar Deducciones y Desgravaciones"
2. Submenu shows 3 options under "Alquiler":
   - "Beneficio 10% (Ley I.G. - Art. 85 inc. k)" → `verAlquilerInmuebleInquilinoN.do`
   - "Beneficio 40% - Inquilinos no propietarios (Ley I.G. - Art. 85 inc. h)" → `verAlquilerInmuebleInquilinoO.do`
   - "Beneficios para Locadores (Propietarios)" → `verAlquilerInmueblePropietario.do`
3. Click the appropriate option.

### Form fields
- **Locador:** CUIT + Denominación
- **Locador Adicional:** Sí/No (select)
- **Inmobiliaria:** ¿Intervino? Sí/No (select)
- **Vigencia contrato:** Fecha Desde / Fecha Hasta (dd/mm/yyyy)
- **Período:** Mes Desde / Mes Hasta (selects Enero-Diciembre)
- **Monto Computable / Monto Tope:** auto-calculated (40% of monthly rent)
- **Declaración:** checkbox "no resulto ser titular de ningún inmueble"
- **Detalle Mensual:** load month by month or by range

### Monthly detail loading (CRITICAL GOTCHA)
- "Agregar Rango de Meses" opens modal with Mes Desde, Mes Hasta, Monto Mensual Alquiler.
- **GOTCHA:** Although you select a range (e.g., Enero-Agosto), the system only loads the FIRST month of the range. Must load month by month.
- "Agregar Mes Individual" opens modal with Mes, Monto Alquiler.
- Future months (after the current month of the tax period) appear as `disabled` in the select.
- The amount is entered as total monthly rent; the system calculates 40% automatically (Monto Tope).

### Ownership validation
- **Requirement:** the taxpayer must NOT own any property, in any proportion.
- Error: "Solo se puede ingresar la deducción si el contribuyente o el causante no resulta titular de ningún inmueble, cualquiera sea la proporción"
- If the taxpayer owns any property (even inheritance, partial, etc.), this deduction is NOT available.

### Comprobantes
- Each loaded month shows "Agregar Comprobante" — asks to associate receipts (rent receipt).
- System warns if 40% of entered receipt amounts is less than the informed amount.

## Keyboard shortcuts

AFIP/ARCA has no keyboard shortcuts. All navigation is via clicks.

## Anti-patterns

- **Do NOT navigate directly to SiRADIG JSP URLs after session expiry.** The portal session and JSP session are independent. Always re-navigate from the portal.
- **Do NOT set input values via `element.value = X` in modals.** JSP forms often don't register JS-set values. Use `exec click <ref>` → `exec type "<value>"` instead.
- **Do NOT hardcode playwright refs.** Refs change between snapshots. Always fetch fresh refs from a new snapshot.
- **Do NOT assume "Agregar Rango de Meses" loads the full range.** It only loads the first month. Load each month individually.
- **Do NOT submit the form without "Vista Previa" and explicit user confirmation.** Submission is irreversible.

## General gotchas

- **Fragile JSP session:** expires on inactivity (~30-60 min). If the app responds "Sesión inactiva", return to portal and re-navigate to SiRADIG.
- **Popups:** SiRADIG opens in a popup. The browser wrapper may not name the new tab. Use `tab-list --json` to find it by URL.
- **Refs change:** playwright-cli refs change between snapshots. Don't hardcode them — fetch fresh each time.
- **Click + type:** for inputs in modals, use `exec click <ref>` → `exec type "<value>"` → `exec click <button_ref>`. Setting `.value` via JS sometimes doesn't register in the JSP form.
- **Timing:** wait 3-5s after clicking links/buttons before reading the page. The JSP app is slow.
- **Do NOT close the browser:** the session is lost if closed. Keep the browser open between operations.
