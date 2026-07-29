---
name: playwright-cli
description: Uso de @playwright/cli para browser automation con perfil persistente.
---
# Playwright CLI

## Comandos base

```bash
npx @playwright/cli open --profile=.browser-profile --headed --browser=chrome <url>  # abrir
npx @playwright/cli close                                                            # cerrar
npx @playwright/cli goto <url>                                                       # navegar
npx @playwright/cli fill <ref> "texto"                                               # completar campo
npx @playwright/cli click <ref>                                                      # clickear
npx @playwright/cli press <key>                                                      # tecla
npx @playwright/cli snapshot                                                          # snapshot
```

## Reglas

- Siempre `npx`, nunca install global
- `--profile=.browser-profile` para sesión persistente (no trackeado)
- `--browser=chrome` usa Chrome real, no Chromium bundleado
- Refs cambian tras cada acción → snapshot nuevo antes de interactuar
- Login inicial headed. Resto headless si no detectan. Si bloquean → headed + recordar en DB
- Validado: Gmail y LinkedIn funcionan headless con sesión persistente (`--profile`). Sin redirect a login
- Headless por defecto. Headed solo cuando requiere intervención del usuario (login manual, 2FA)
- Config en `.playwright/cli.config.json` con `headless: true` por defecto. Sobreescribir con `--headed` cuando haga falta

## Detección de automation

Playwright inyecta `--disable-blink-features=AutomationControlled` a nivel interno. No se puede remover. Chrome muestra warning. Tradeoff: perfil dedicado + marker visible vs `attach --extension` (sin marker pero usa Chrome real). Decisión: perfil dedicado. Migrar a `attach --extension` solo si banean.

## No trackeado

`.browser-profile/` y `.playwright-cli/` en `.gitignore`.
